/**
 * Branded progress-report PDF for email "Save as PDF" links.
 * Uses pdf-lib only (application/pdf) — never upload text/html to storage.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'https://esm.sh/pdf-lib@1.17.1'
import {
  collectProgressReportPhotoGroups,
  fetchImageBytesForPdf,
  type ProgressReportPhotoGroup,
} from './progressReportPdf.ts'

type Branding = {
  logo_url?: string | null
  primary_color?: string | null
  secondary_color?: string | null
  company_footer?: string | null
  organization_name?: string | null
}

type ScheduleLike = {
  name?: string | null
  custom_subject?: string | null
  report_audience_type?: string | null
  report_sections?: Record<string, unknown> | null
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

function hexToRgb(hex: string | null | undefined, fallback: RGB): RGB {
  const raw = String(hex || '').trim()
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(raw)
  if (!m) return fallback
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255)
}

/** pdf-lib StandardFonts (WinAnsi) cannot encode many Unicode glyphs. */
export function sanitizePdfText(text: string): string {
  const replaced = String(text || '')
    .replace(/\u2192/g, '->')
    .replace(/\u27f6/g, '->')
    .replace(/\u2713|\u2714|\u2611/g, '[x]')
    .replace(/\u2610/g, '[ ]')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201c\u201d\u201E]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0|\u202f|\u2007/g, ' ')
  let decomposed: string
  try {
    decomposed = replaced.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  } catch {
    decomposed = replaced
  }
  let out = ''
  for (const ch of decomposed) {
    const c = ch.charCodeAt(0)
    if (ch === '\n' || ch === '\r' || ch === '\t') {
      out += ch
      continue
    }
    if (c >= 32 && c <= 126) {
      out += ch
      continue
    }
    out += ' '
  }
  return out.replace(/ +(\n|$)/g, '$1').replace(/[ \t]+/g, ' ')
}

function formatDate(dateString: unknown): string {
  if (!dateString) return ''
  const raw = String(dateString).trim()
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  const date = isoDay
    ? new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]))
    : new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatReadableDate(dateString: unknown): string {
  if (!dateString) return ''
  const raw = String(dateString).trim()
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  const date = isoDay
    ? new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]))
    : new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatPeriod(startDate: unknown, endDate: unknown): string {
  if (!startDate && !endDate) return ''
  if (startDate && endDate) return `${formatDate(startDate)} - ${formatDate(endDate)}`
  return startDate ? `Since ${formatDate(startDate)}` : `Up to ${formatDate(endDate)}`
}

function resolveSections(schedule: ScheduleLike) {
  const s = (schedule?.report_sections || {}) as Record<string, unknown>
  const weeklySetting = s.weekly_plan ?? s.lookahead
  return {
    status_changes: s.status_changes !== false,
    task_completion: s.task_completion !== false,
    phase_changes: s.phase_changes !== false,
    vitals: s.vitals !== false,
    weekly_plan: weeklySetting !== false,
    show_assignees: s.show_assignees === true,
    show_dates: s.show_dates === true,
    show_who_changed: s.show_who_changed === true,
    show_phase_delta: s.show_phase_delta === true,
    show_blockers: s.show_blockers === true,
    show_weather_impacts: s.show_weather_impacts === true,
    show_schedule_adjustments: s.show_schedule_adjustments === true,
    keep_original_completion_date: s.keep_original_completion_date !== false,
    include_task_photos:
      schedule.report_audience_type === 'internal' || s.include_task_photos === true,
    show_task_phase: s.show_task_phase === true,
  }
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = sanitizePdfText(text).split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let current = words[0]
  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate
    } else {
      lines.push(current)
      current = words[i]
    }
  }
  lines.push(current)
  return lines
}

/** Truncate to fit a single line (avoids pdf-lib text spilling into neighboring cards). */
function fitSingleLine(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  const s = sanitizePdfText(text)
  if (!s) return ''
  if (font.widthOfTextAtSize(s, fontSize) <= maxWidth) return s
  let out = s
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, fontSize) > maxWidth) {
    out = out.slice(0, -1)
  }
  return `${out}...`
}

type DrawCtx = {
  pdfDoc: PDFDocument
  page: PDFPage
  cursorY: number
  regular: PDFFont
  bold: PDFFont
  primary: RGB
  secondary: RGB
  ink: RGB
  muted: RGB
  rule: RGB
}

function startNewPage(ctx: DrawCtx) {
  ctx.page = ctx.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  ctx.cursorY = PAGE_HEIGHT - MARGIN
  // Subtle top accent on continuation pages
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 6,
    width: PAGE_WIDTH,
    height: 6,
    color: ctx.primary,
  })
  ctx.cursorY = PAGE_HEIGHT - MARGIN - 8
}

function ensureRoom(ctx: DrawCtx, heightNeeded: number) {
  if (ctx.cursorY - heightNeeded < MARGIN + 24) startNewPage(ctx)
}

function drawTextLines(
  ctx: DrawCtx,
  text: string,
  opts: { font?: PDFFont; size?: number; color?: RGB; maxWidth?: number; gap?: number } = {},
) {
  const font = opts.font || ctx.regular
  const size = opts.size ?? 11
  const color = opts.color || ctx.ink
  const maxWidth = opts.maxWidth ?? CONTENT_WIDTH
  const gap = opts.gap ?? size * 1.35
  const lines = wrapText(text, font, size, maxWidth)
  for (const line of lines) {
    ensureRoom(ctx, gap)
    ctx.page.drawText(line, { x: MARGIN, y: ctx.cursorY, size, font, color })
    ctx.cursorY -= gap
  }
}

function drawSectionHeading(ctx: DrawCtx, title: string) {
  ensureRoom(ctx, 28)
  ctx.cursorY -= 10
  ctx.page.drawText(sanitizePdfText(title), {
    x: MARGIN,
    y: ctx.cursorY,
    size: 13,
    font: ctx.bold,
    color: ctx.primary,
  })
  ctx.cursorY -= 18
}

function drawBullet(ctx: DrawCtx, text: string, bullet = '-') {
  const lines = wrapText(text, ctx.regular, 11, CONTENT_WIDTH - 16)
  const blockH = lines.length * 14 + 4
  ensureRoom(ctx, Math.min(blockH, 40))
  ctx.page.drawText(bullet, {
    x: MARGIN,
    y: ctx.cursorY,
    size: 11,
    font: ctx.regular,
    color: ctx.ink,
  })
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) ensureRoom(ctx, 14)
    ctx.page.drawText(lines[i], {
      x: MARGIN + 14,
      y: ctx.cursorY,
      size: 11,
      font: ctx.regular,
      color: ctx.ink,
    })
    ctx.cursorY -= 14
  }
  ctx.cursorY -= 4
}

async function embedRemoteImage(
  pdfDoc: PDFDocument,
  url: string | null | undefined,
): Promise<{ width: number; height: number; draw: (page: PDFPage, x: number, y: number, w: number, h: number) => void } | null> {
  if (!url) return null
  const fetched = await fetchImageBytesForPdf(url)
  if (!fetched) return null
  try {
    const embedded =
      fetched.kind === 'png' ? await pdfDoc.embedPng(fetched.bytes) : await pdfDoc.embedJpg(fetched.bytes)
    return {
      width: embedded.width,
      height: embedded.height,
      draw: (page, x, y, w, h) => page.drawImage(embedded, { x, y, width: w, height: h }),
    }
  } catch {
    return null
  }
}

async function embedPhotoImage(
  pdfDoc: PDFDocument,
  photo: { thumbnail_url?: string | null; full_url?: string | null },
) {
  // Prefer full JPEG originals; thumbnails are often missing or a less embeddable format.
  const urls = [photo.full_url, photo.thumbnail_url].filter(
    (u, i, arr): u is string => typeof u === 'string' && !!u.trim() && arr.indexOf(u) === i,
  )
  for (const url of urls) {
    const img = await embedRemoteImage(pdfDoc, url)
    if (img) return img
  }
  return null
}

async function drawPhotoStrip(ctx: DrawCtx, group: ProgressReportPhotoGroup) {
  const photos = group.photos || []
  if (photos.length === 0) return

  if (String(group.label || '').trim()) {
    drawTextLines(ctx, group.label, { font: ctx.bold, size: 10, color: ctx.ink })
    ctx.cursorY -= 4
  }

  const maxW = 150
  const maxH = 110
  let x = MARGIN
  let rowH = 0
  const gapX = 12
  const pageBottom = MARGIN + 28

  const advanceRow = () => {
    if (rowH <= 0) return
    ctx.cursorY -= rowH + 12
    x = MARGIN
    rowH = 0
  }

  for (const photo of photos) {
    const img = await embedPhotoImage(ctx.pdfDoc, photo)
    if (!img) continue
    const scale = Math.min(maxW / img.width, maxH / img.height, 1)
    const w = img.width * scale
    const h = img.height * scale
    const caption = photo.caption ? sanitizePdfText(String(photo.caption)).slice(0, 42) : ''
    const captionH = caption ? 12 : 0
    const badgeH = photo.is_completion_photo ? 10 : 0
    const blockH = h + captionH + badgeH + 8

    // Wrap to next row when this photo would overflow the page width.
    if (x > MARGIN && x + w > PAGE_WIDTH - MARGIN) {
      advanceRow()
    }

    // Page break before drawing if the full photo block won't fit.
    if (ctx.cursorY - blockH < pageBottom) {
      advanceRow()
      startNewPage(ctx)
      x = MARGIN
      rowH = 0
    }

    const imgTop = ctx.cursorY
    const imgBottom = imgTop - h
    img.draw(ctx.page, x, imgBottom, w, h)
    ctx.page.drawRectangle({
      x,
      y: imgBottom,
      width: w,
      height: h,
      borderColor: ctx.rule,
      borderWidth: 0.75,
    })

    let labelY = imgBottom - 10
    if (caption) {
      ctx.page.drawText(fitSingleLine(caption, ctx.regular, 8, w), {
        x,
        y: labelY,
        size: 8,
        font: ctx.regular,
        color: ctx.muted,
      })
      labelY -= 10
    }
    if (photo.is_completion_photo) {
      ctx.page.drawText('Completion', {
        x,
        y: labelY,
        size: 7,
        font: ctx.bold,
        color: ctx.secondary,
      })
    }

    rowH = Math.max(rowH, blockH)
    x += w + gapX
  }

  advanceRow()
}

export async function buildBrandedProgressReportPdf(opts: {
  subject: string
  reportData: Record<string, unknown>
  schedule: ScheduleLike
  branding?: Branding | null
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const primary = hexToRgb(opts.branding?.primary_color, rgb(0.23, 0.51, 0.96))
  const secondary = hexToRgb(opts.branding?.secondary_color, rgb(0.06, 0.73, 0.51))
  const ink = rgb(0.12, 0.16, 0.22)
  const muted = rgb(0.42, 0.45, 0.5)
  const rule = rgb(0.89, 0.91, 0.94)
  const cardBg = rgb(0.97, 0.98, 0.99)

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const ctx: DrawCtx = {
    pdfDoc,
    page,
    cursorY: PAGE_HEIGHT - MARGIN,
    regular,
    bold,
    primary,
    secondary,
    ink,
    muted,
    rule,
  }

  // Header band
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 10,
    width: PAGE_WIDTH,
    height: 10,
    color: primary,
  })
  ctx.cursorY = PAGE_HEIGHT - MARGIN - 6

  // Optional logo
  const logo = await embedRemoteImage(pdfDoc, opts.branding?.logo_url || null)
  if (logo) {
    const maxH = 40
    const scale = Math.min(160 / logo.width, maxH / logo.height, 1)
    const w = logo.width * scale
    const h = logo.height * scale
    ensureRoom(ctx, h + 28)
    logo.draw(ctx.page, MARGIN, ctx.cursorY - h, w, h)
    // Keep clear air between logo and title (was ~14pt — felt stuck to the heading).
    ctx.cursorY -= h + 28
  }

  const data = opts.reportData || {}
  const sections = resolveSections(opts.schedule)
  const projectTitle = String(
    data.project_name || data.organization_name || opts.branding?.organization_name || 'Project',
  )
  const period = formatPeriod(data.start_date, data.end_date)
  const title = sanitizePdfText(opts.subject || opts.schedule.custom_subject || `Progress Update: ${projectTitle}`)

  drawTextLines(ctx, title, { font: bold, size: 20, color: ink, gap: 24 })
  if (period) {
    drawTextLines(ctx, period, { size: 11, color: muted, gap: 14 })
  }
  ctx.cursorY -= 6
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.cursorY,
    width: CONTENT_WIDTH,
    height: 1,
    color: rule,
  })
  ctx.cursorY -= 18

  const slices = Array.isArray(data.org_project_slices)
    ? (data.org_project_slices as Record<string, unknown>[])
    : null

  const drawVitals = (vitals: Record<string, unknown> | null | undefined) => {
    if (!sections.vitals || !vitals) return
    const cards: { label: string; value: string }[] = []
    if (vitals.tasks_completed_count != null && vitals.open_tasks_count != null) {
      cards.push({
        label: 'Done vs open',
        value: `${vitals.tasks_completed_count} / ${vitals.open_tasks_count}`,
      })
    }
    if (vitals.project_end_date) {
      cards.push({ label: 'Latest task', value: formatReadableDate(vitals.project_end_date) })
    }
    if (vitals.schedule_day_current != null && vitals.schedule_day_total != null) {
      cards.push({
        label: 'Progress',
        value: `${vitals.schedule_day_current} / ${vitals.schedule_day_total} days`,
      })
    }
    if (cards.length === 0) return

    const gap = 10
    const cardW = (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length
    const cardH = 48
    ensureRoom(ctx, cardH + 16)
    let x = MARGIN
    for (const card of cards) {
      ctx.page.drawRectangle({
        x,
        y: ctx.cursorY - cardH,
        width: cardW,
        height: cardH,
        color: cardBg,
        borderColor: rule,
        borderWidth: 1,
      })
      ctx.page.drawText(fitSingleLine(card.label, regular, 8, cardW - 16), {
        x: x + 8,
        y: ctx.cursorY - 16,
        size: 8,
        font: regular,
        color: muted,
      })
      ctx.page.drawText(fitSingleLine(card.value, bold, 12, cardW - 16), {
        x: x + 8,
        y: ctx.cursorY - 34,
        size: 12,
        font: bold,
        color: ink,
      })
      x += cardW + gap
    }
    ctx.cursorY -= cardH + 18
  }

  const drawStandardBlock = async (block: Record<string, unknown>, heading?: string) => {
    if (heading) {
      ensureRoom(ctx, 28)
      drawTextLines(ctx, heading, { font: bold, size: 15, color: ink, gap: 18 })
      if (block.project_status) {
        drawTextLines(ctx, `Status: ${String(block.project_status)}`, {
          size: 10,
          color: muted,
          gap: 13,
        })
      }
    }

    drawVitals(block.vitals as Record<string, unknown> | undefined)

    const statusChanges = Array.isArray(block.status_changes) ? block.status_changes : []
    if (sections.status_changes && statusChanges.length > 0) {
      drawSectionHeading(ctx, 'Status update')
      for (const sc of statusChanges as any[]) {
        const who =
          sections.show_who_changed && sc.changed_by ? ` (${sc.changed_by})` : ''
        drawBullet(
          ctx,
          `${sc.project_name || 'Project'}: ${sc.old_status || '?'} -> ${sc.new_status || '?'}${who}`,
        )
      }
    }

    const completed = Array.isArray(block.completed_tasks) ? block.completed_tasks : []
    if (sections.task_completion && completed.length > 0) {
      drawSectionHeading(ctx, 'Completed this period')
      for (const task of completed as any[]) {
        const phase =
          sections.show_task_phase && task.phase_name ? ` [${task.phase_name}]` : ''
        const who =
          sections.show_assignees && task.assignee ? ` (@${task.assignee})` : ''
        const when =
          sections.show_dates && task.completed_at
            ? ` - ${formatDate(task.completed_at)}`
            : ''
        drawBullet(ctx, `${task.text || task.title || 'Task'}${phase}${who}${when}`)

        if (sections.include_task_photos && Array.isArray(task.photos) && task.photos.length > 0) {
          await drawPhotoStrip(ctx, {
            label: '',
            photos: task.photos,
          })
        }
      }
    }

    const phases = Array.isArray(block.phase_progress) ? block.phase_progress : []
    if (sections.phase_changes && phases.length > 0) {
      drawSectionHeading(ctx, 'Phase progress')
      for (const p of phases as any[]) {
        const delta =
          sections.show_phase_delta && p.old_progress != null
            ? ` (was ${p.old_progress}%)`
            : ''
        drawBullet(ctx, `${p.name || 'Phase'}: ${p.progress ?? 0}%${delta}`)
      }
    }

    if (sections.weekly_plan) {
      let lastWeek = Array.isArray(block.last_week_done) ? block.last_week_done : []
      const thisWeek = Array.isArray(block.this_week_plan) ? block.this_week_plan : []
      const nextWeek = Array.isArray(block.next_week_plan) ? block.next_week_plan : []

      // Weekly reports often put the same completions in "Completed this period", which
      // empties last_week_done. Rebuild a last-week list for the PDF from period completions.
      if (!lastWeek.length) {
        const completed = Array.isArray(block.completed_tasks) ? block.completed_tasks : []
        const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000
        lastWeek = completed
          .filter((t: any) => {
            const raw = t?.completed_at
            if (!raw) return true
            const ms = new Date(raw).getTime()
            return Number.isFinite(ms) ? ms >= weekAgoMs : true
          })
          .slice(0, 12)
          .map((t: any) => ({
            text: t.text || t.title || 'Task',
            title: t.title || t.text || 'Task',
            // Photos already render under Completed this period — avoid duplicating them here.
          }))
      }

      if (lastWeek.length || thisWeek.length || nextWeek.length) {
        drawSectionHeading(ctx, 'Weekly plan')
        const emptyCopy: Record<string, string> = {
          'Last week': 'No completed tasks in the last week.',
          'This week': 'No tasks scheduled this week.',
          'Next week': 'No tasks scheduled for next week.',
        }
        const renderWeek = async (label: string, rows: any[]) => {
          drawTextLines(ctx, label, { font: bold, size: 11, color: ink, gap: 15 })
          ctx.cursorY -= 2
          if (!rows.length) {
            drawTextLines(ctx, emptyCopy[label] || 'None.', { size: 11, color: muted, gap: 14 })
            ctx.cursorY -= 6
            return
          }
          for (const t of rows.slice(0, 12)) {
            const start =
              t.start_date && (label === 'This week' || label === 'Next week')
                ? ` (starts ${formatReadableDate(t.start_date)})`
                : ''
            drawBullet(ctx, `${String(t.text || t.title || 'Task')}${start}`)
            if (
              label === 'Last week' &&
              sections.include_task_photos &&
              Array.isArray(t.photos) &&
              t.photos.length > 0
            ) {
              await drawPhotoStrip(ctx, { label: '', photos: t.photos })
            }
          }
          ctx.cursorY -= 6
        }
        await renderWeek('Last week', lastWeek)
        await renderWeek('This week', thisWeek)
        await renderWeek('Next week', nextWeek)
      }
    }

    const weather = Array.isArray(block.weather_impacts) ? block.weather_impacts : []
    if (sections.show_weather_impacts && weather.length > 0) {
      drawSectionHeading(ctx, 'Weather & schedule impacts')
      for (const w of weather as any[]) {
        drawBullet(
          ctx,
          `${w.summary || w.description || 'Weather impact'}${
            w.project_name ? ` (${w.project_name})` : ''
          }`,
        )
      }
    }

    const scheduleAdj = Array.isArray(block.schedule_adjustments) ? block.schedule_adjustments : []
    if (sections.show_schedule_adjustments && scheduleAdj.length > 0) {
      drawSectionHeading(ctx, 'Schedule improvements')
      for (const w of scheduleAdj as any[]) {
        drawBullet(
          ctx,
          `${w.note || 'Schedule pull-forward'}: ${w.applied_workdays ?? ''} workday(s) pulled forward${
            w.project_name ? ` (${w.project_name})` : ''
          }`,
        )
      }
    }

    const snap = block.snapshot as Record<string, unknown> | undefined
    const hasActivity =
      statusChanges.length > 0 ||
      completed.length > 0 ||
      phases.length > 0 ||
      weather.length > 0 ||
      scheduleAdj.length > 0
    if (!hasActivity && snap) {
      drawSectionHeading(ctx, 'Snapshot')
      if (snap.open_total != null || snap.completed_total != null) {
        drawTextLines(
          ctx,
          `${snap.open_total ?? 0} open, ${snap.completed_total ?? 0} completed overall.`,
          { size: 11, color: muted },
        )
      }
      const openTasks = Array.isArray(snap.open_tasks) ? snap.open_tasks : []
      for (const t of openTasks.slice(0, 20) as any[]) {
        drawBullet(ctx, String(t.text || 'Task'))
        if (sections.include_task_photos && Array.isArray(t.photos) && t.photos.length > 0) {
          await drawPhotoStrip(ctx, { label: '', photos: t.photos })
        }
      }
    }
  }

  if (opts.schedule.report_audience_type === 'executive') {
    if (data.executive_summary) {
      drawSectionHeading(ctx, 'Summary')
      drawTextLines(ctx, String(data.executive_summary), { size: 11, color: ink, gap: 14 })
      ctx.cursorY -= 6
    }
    drawVitals(data.vitals as Record<string, unknown> | undefined)
    const highlights = Array.isArray(data.key_highlights) ? data.key_highlights : []
    if (highlights.length) {
      drawSectionHeading(ctx, 'Key highlights')
      for (const h of highlights) drawBullet(ctx, String(h))
    }
  } else if (slices && slices.length > 0) {
    drawVitals(data.vitals as Record<string, unknown> | undefined)
    drawTextLines(ctx, `${slices.length} project(s) in this report`, {
      size: 11,
      color: muted,
      gap: 16,
    })
    for (const slice of slices) {
      await drawStandardBlock(slice, String(slice.project_name || 'Project'))
      ctx.cursorY -= 8
    }
  } else {
    await drawStandardBlock(data)
  }

  // Appendix photos if completed tasks didn't include them but groups exist
  if (sections.include_task_photos) {
    const groups = collectProgressReportPhotoGroups(data).filter((g) => g.photos?.length)
    // Photos already drawn inline for completed/open tasks; appendix only if we somehow
    // have groups but no completed_tasks array photos (e.g. stripped). Skip duplicate
    // appendix when completed_tasks already had photos.
    const hadInline = Array.isArray(data.completed_tasks)
      ? (data.completed_tasks as any[]).some((t) => t?.photos?.length)
      : false
    const hadSliceInline = slices?.some((s) =>
      Array.isArray(s.completed_tasks)
        ? (s.completed_tasks as any[]).some((t) => t?.photos?.length)
        : false,
    )
    if (groups.length && !hadInline && !hadSliceInline) {
      drawSectionHeading(ctx, 'Task photos')
      for (const g of groups) await drawPhotoStrip(ctx, g)
    }
  }

  // Footer
  ensureRoom(ctx, 40)
  ctx.cursorY -= 8
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.cursorY,
    width: CONTENT_WIDTH,
    height: 1,
    color: rule,
  })
  ctx.cursorY -= 16
  const footerOrg = opts.branding?.organization_name || data.organization_name || 'SiteWeave'
  drawTextLines(ctx, `Generated by SiteWeave  ·  ${footerOrg}`, {
    size: 9,
    color: muted,
    gap: 12,
  })
  if (opts.branding?.company_footer) {
    drawTextLines(ctx, String(opts.branding.company_footer), {
      size: 9,
      color: muted,
      gap: 12,
    })
  }

  return await pdfDoc.save()
}
