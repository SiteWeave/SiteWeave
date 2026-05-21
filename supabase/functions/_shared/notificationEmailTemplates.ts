function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Public mark for transactional emails (matches progress report templates). */
const SITEWEAVE_LOGO_URL = 'https://app.siteweave.org/logo.svg'

function stripProjectPrefixFromHeading(heading: string, projectName: string): string {
  const h = String(heading || '').trim()
  const p = String(projectName || '').trim()
  if (!p || !h) return h
  const prefix = `${p}:`
  if (h.length >= prefix.length && h.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
    const rest = h.slice(prefix.length).trim()
    return rest || h
  }
  return h
}

/**
 * Format a Postgres date / ISO string for email. When the value is `YYYY-MM-DD`, it is treated as a
 * calendar date (no timezone shift). Full timestamps still use normal Date parsing.
 */
export function formatDigestDueDate(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null
  const trimmed = iso.trim()
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (ymd) {
    const y = Number(ymd[1])
    const mo = Number(ymd[2])
    const d = Number(ymd[3])
    if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null
    const dt = new Date(Date.UTC(y, mo - 1, d))
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  }
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** IANA zone for comparing date-only fields to “today” (matches org `progress_report_timezone`). */
function resolveCalendarTimeZone(raw: string | null | undefined): string {
  const z = typeof raw === 'string' && raw.trim() ? raw.trim() : 'America/New_York'
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: z })
    return z
  } catch {
    return 'America/New_York'
  }
}

function calendarYmdInTimeZone(d: Date, timeZone: string): string | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const mapped = Object.fromEntries(
      formatter.formatToParts(d).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
    ) as { year?: string; month?: string; day?: string }
    const y = mapped.year
    const mo = mapped.month
    const day = mapped.day
    if (!y || !mo || !day) return null
    return `${y}-${mo}-${day}`
  } catch {
    return null
  }
}

/**
 * Calendar-day difference: date-only `dueDateIso` minus “today” in `calendarTimeZone` (0 = due today).
 * Uses IANA timezone so counts match the project/org calendar, not UTC-only “today”.
 */
export function dueCalendarDiffDays(
  dueDateIso: string | null | undefined,
  now: Date = new Date(),
  calendarTimeZone?: string | null,
): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dueDateIso ?? '').trim())
  if (!m) return null
  const due = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const tz = resolveCalendarTimeZone(calendarTimeZone)
  const todayStr = calendarYmdInTimeZone(now, tz)
  if (!todayStr) return null
  const tm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayStr)
  if (!tm) return null
  const t = Date.UTC(Number(tm[1]), Number(tm[2]) - 1, Number(tm[3]))
  return Math.round((due - t) / 86400000)
}

export function formatDueInDaysPhrase(diffDays: number | null): string | null {
  if (diffDays === null || Number.isNaN(diffDays)) return null
  if (diffDays > 1) return `Due in ${diffDays} days`
  if (diffDays === 1) return 'Due tomorrow'
  if (diffDays === 0) return 'Due today'
  if (diffDays === -1) return 'Overdue since yesterday'
  if (diffDays < -1) return `Overdue by ${-diffDays} days`
  return null
}

function urgencyVisual(diffDays: number | null): { wrap: string; dateColor: string; phraseColor: string } {
  if (diffDays === null || Number.isNaN(diffDays)) {
    return {
      wrap: 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:10px 0 0;',
      dateColor: '#0f172a',
      phraseColor: '#475569',
    }
  }
  if (diffDays < 0) {
    return {
      wrap: 'background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;margin:10px 0 0;',
      dateColor: '#7f1d1d',
      phraseColor: '#b91c1c',
    }
  }
  if (diffDays === 0) {
    return {
      wrap: 'background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;margin:10px 0 0;',
      dateColor: '#7c2d12',
      phraseColor: '#c2410c',
    }
  }
  if (diffDays <= 3) {
    return {
      wrap: 'background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;margin:10px 0 0;',
      dateColor: '#78350f',
      phraseColor: '#b45309',
    }
  }
  return {
    wrap: 'background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px;margin:10px 0 0;',
    dateColor: '#1e3a8a',
    phraseColor: '#1d4ed8',
  }
}

export type DigestTask = {
  title: string
  dueLabel?: string | null
  priority?: string | null
  dueDateLabel?: string | null
  /** `YYYY-MM-DD` (or timestamp string); used for “Due in N days” vs send time. */
  dueDateIso?: string | null
  startDateLabel?: string | null
  /** `YYYY-MM-DD` on-site / field start (shown as “On-site on …”). */
  startDateIso?: string | null
}

export type DigestParams = {
  heading: string
  subheading: string
  ctaUrl: string
  /** Prominent review link text (must not include raw HTML). */
  reviewLinkText?: string | null
  summaryLabel: string
  summaryValue: string | number
  tasks: DigestTask[]
  recipientName?: string | null
  footerText?: string
  /** Project name for context block (may match heading). */
  projectName?: string | null
  /** Street / location line when available. */
  projectAddress?: string | null
  /** Section title above task table. */
  tasksSectionTitle?: string | null
  /**
   * When true, omit the reminder headline (h1) and subheading so the task block is the main focus.
   * Plain-text body skips those lines as well.
   */
  omitLeadBlock?: boolean
  /** IANA timezone for “today” vs task date-only fields (e.g. org `progress_report_timezone`). */
  calendarTimeZone?: string | null
}

function taskMetaLine(task: DigestTask, now: Date, calendarTimeZone: string): string {
  const parts: string[] = []
  const startFmt = task.startDateLabel || (task.startDateIso ? formatDigestDueDate(task.startDateIso) : null)
  if (startFmt) parts.push(`On-site on ${startFmt}`)
  if (task.dueDateLabel) parts.push(`Due on ${task.dueDateLabel}`)
  else if (task.dueDateIso) {
    const f = formatDigestDueDate(task.dueDateIso)
    if (f) parts.push(`Due on ${f}`)
  }
  if (task.dueLabel) parts.push(String(task.dueLabel))
  const phrase = formatDueInDaysPhrase(dueCalendarDiffDays(task.dueDateIso, now, calendarTimeZone))
  let s = parts.join(' · ')
  if (phrase) s = s ? `${s} · ${phrase}` : phrase
  return s
}

function digestTaskDetailHtml(
  task: DigestTask,
  opts: {
    sentAt: Date
    showInlineReviewLink: boolean
    ctaUrl?: string | null
    reviewLinkText?: string | null
    calendarTimeZone: string
  },
): string {
  const { sentAt, showInlineReviewLink, ctaUrl, reviewLinkText, calendarTimeZone } = opts
  const chunks: string[] = []

  const displayStart = task.startDateLabel || (task.startDateIso ? formatDigestDueDate(task.startDateIso) : null)
  const displayDue = task.dueDateLabel || (task.dueDateIso ? formatDigestDueDate(task.dueDateIso) : null)
  const diff = dueCalendarDiffDays(task.dueDateIso, sentAt, calendarTimeZone)
  const phrase = formatDueInDaysPhrase(diff)
  const urgencyDiff =
    diff !== null && !Number.isNaN(diff)
      ? diff
      : dueCalendarDiffDays(task.startDateIso, sentAt, calendarTimeZone)
  const hasDateBlock = Boolean(displayStart || displayDue || phrase)

  if (hasDateBlock) {
    const vis = urgencyVisual(urgencyDiff)
    const labelStyle =
      'margin:0;font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#64748b;'
    const sentenceStyle = `margin:6px 0 0;font-size:19px;line-height:1.25;font-weight:800;color:${vis.dateColor};letter-spacing:-0.02em;`
    const startBlock = displayStart
      ? `<div>
        <p style="${labelStyle}">On-site</p>
        <p style="${sentenceStyle}">${escapeHtml(`On-site on ${displayStart}`)}</p>
      </div>`
      : ''
    const dueTop = displayStart ? '14px' : '0'
    const dueBlock = displayDue || phrase
      ? `<div style="margin-top:${dueTop};padding-top:${displayStart ? '12px' : '0'};${displayStart ? 'border-top:1px solid rgba(148,163,184,0.35);' : ''}">
        ${displayDue ? `<p style="${labelStyle}">Due</p><p style="${sentenceStyle}">${escapeHtml(`Due on ${displayDue}`)}</p>` : ''}
        ${
          phrase
            ? `<p style="margin:${displayDue ? '8px' : '0'} 0 0;font-size:15px;line-height:1.35;font-weight:700;color:${vis.phraseColor};">${escapeHtml(phrase)}</p>`
            : ''
        }
      </div>`
      : ''
    chunks.push(
      `<div style="${vis.wrap}">
        ${startBlock}
        ${dueBlock}
      </div>`,
    )
  } else if (task.dueLabel) {
    chunks.push(
      `<p style="margin:10px 0 0;font-size:14px;line-height:1.4;color:#475569;font-weight:600;">${escapeHtml(String(task.dueLabel))}</p>`,
    )
  }

  if (showInlineReviewLink && ctaUrl && reviewLinkText) {
    chunks.push(
      `<p style="margin:14px 0 0;font-size:14px;line-height:1.45;"><a href="${escapeHtml(ctaUrl)}" style="color:#1d4ed8;font-weight:700;text-decoration:underline;">${escapeHtml(reviewLinkText)}</a></p>`,
    )
  }

  return chunks.join('\n')
}

export function buildMinimalDigestEmail(params: DigestParams): { html: string; text: string } {
  const {
    heading,
    subheading,
    ctaUrl,
    reviewLinkText: reviewLinkTextParam,
    summaryLabel,
    summaryValue,
    tasks,
    recipientName,
    footerText = 'Automated notification from SiteWeave',
    projectName,
    projectAddress,
    tasksSectionTitle,
    omitLeadBlock = false,
    calendarTimeZone: calendarTimeZoneRaw,
  } = params

  const sentAt = new Date()
  const calendarTimeZone = resolveCalendarTimeZone(calendarTimeZoneRaw)

  const safeTasks = tasks.slice(0, 8)
  const defaultReview =
    safeTasks.length > 1 ? 'Review your tasks in SiteWeave' : 'Review this task in SiteWeave'
  const reviewLinkText = (reviewLinkTextParam && String(reviewLinkTextParam).trim()) || defaultReview

  const showSummaryRow =
    safeTasks.length > 1 || (summaryValue !== undefined && summaryValue !== null && Number(summaryValue) > 1)

  const projectNameTrimmed = projectName && String(projectName).trim() ? String(projectName).trim() : ''
  const mastheadTitle = projectNameTrimmed || String(heading || '').trim() || 'SiteWeave'
  const reminderHeadline = projectNameTrimmed
    ? stripProjectPrefixFromHeading(String(heading || ''), projectNameTrimmed)
    : String(heading || '').trim()

  const locationOnlyLines: string[] = []
  if (projectAddress && String(projectAddress).trim()) {
    locationOnlyLines.push(
      `<p style="margin:0;font-size:15px;color:#374151;"><strong>Location</strong>: ${escapeHtml(String(projectAddress).trim())}</p>`,
    )
  }
  const locationBlock =
    locationOnlyLines.length > 0
      ? `<div style="padding:0 0 10px;border-bottom:1px solid #e5e7eb;margin-bottom:10px;">${locationOnlyLines.join('')}</div>`
      : ''

  const multiWithSharedCta = safeTasks.length > 1 && Boolean(ctaUrl && reviewLinkText)

  const taskRows = safeTasks
    .map((task) => {
      const showInlineReviewLink = Boolean(!multiWithSharedCta && ctaUrl && reviewLinkText)
      const detailHtml = digestTaskDetailHtml(task, {
        sentAt,
        showInlineReviewLink,
        ctaUrl,
        reviewLinkText,
        calendarTimeZone,
      })
      return `
        <tr>
          <td style="padding:14px 16px;border-top:1px solid #e5e7eb;vertical-align:top;">
            <p style="margin:0;color:#111827;font-size:17px;line-height:1.35;font-weight:700;">${escapeHtml(task.title)}</p>
            ${detailHtml}
          </td>
        </tr>
      `
    })
    .join('')

  const postTaskTableLink = multiWithSharedCta
    ? `<p style="margin:14px 16px 0;font-size:14px;line-height:1.45;">
        <a href="${escapeHtml(ctaUrl)}" style="color:#1d4ed8;font-weight:600;text-decoration:underline;">${escapeHtml(reviewLinkText)}</a>
      </p>`
    : ''

  const sectionTitle = tasksSectionTitle && String(tasksSectionTitle).trim()
    ? String(tasksSectionTitle).trim()
    : 'Tasks'

  const sectionHeadingStyle = omitLeadBlock
    ? 'margin:0;font-size:26px;line-height:1.25;font-weight:700;color:#111827;letter-spacing:-0.02em;'
    : 'margin:0;font-size:20px;line-height:1.3;font-weight:600;color:#111827;'
  const sectionHeadingTag = omitLeadBlock ? 'h1' : 'h2'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr>
      <td align="center">
        <table role="presentation" style="width:100%;max-width:680px;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px 12px;border-bottom:1px solid #e5e7eb;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="vertical-align:middle;padding:0 16px 0 0;">
                    <p style="margin:0;font-size:26px;line-height:1.2;font-weight:700;color:#111827;letter-spacing:-0.02em;">${escapeHtml(mastheadTitle)}</p>
                  </td>
                  <td style="width:1%;white-space:nowrap;vertical-align:middle;text-align:right;padding:0;">
                    <img src="${SITEWEAVE_LOGO_URL}" alt="SiteWeave" width="44" height="44" style="display:block;width:44px;height:44px;border:0;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 24px 0;">
              ${locationBlock}
              ${
                omitLeadBlock
                  ? ''
                  : `<h1 style="margin:0;font-size:22px;line-height:1.25;font-weight:600;color:#111827;">${escapeHtml(reminderHeadline || heading)}</h1>
              <p style="margin:10px 0 0;font-size:18px;line-height:1.35;color:#4b5563;">${escapeHtml(subheading)}</p>`
              }
            </td>
          </tr>
          ${
            showSummaryRow
              ? `<tr>
            <td style="padding:16px 24px 12px;">
              <div style="background:#f3f4f6;border-radius:8px;padding:12px 16px;text-align:center;color:#374151;font-size:16px;">
                <span>${escapeHtml(summaryLabel)}: <strong>${escapeHtml(summaryValue)}</strong></span>
              </div>
            </td>
          </tr>`
              : ''
          }
          <tr>
            <td style="${omitLeadBlock ? 'padding:18px 24px 12px;' : 'padding:6px 24px 10px;'}">
              <${sectionHeadingTag} style="${sectionHeadingStyle}">${escapeHtml(sectionTitle)}</${sectionHeadingTag}>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;">
              <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                ${taskRows || '<tr><td style="padding:14px 16px;color:#6b7280;font-size:14px;">No tasks in this window.</td></tr>'}
              </table>
              ${postTaskTableLink}
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 20px;">
              <p style="margin:0;color:#6b7280;font-size:13px;">${escapeHtml(recipientName ? `Hi ${recipientName},` : 'Hi there,')}</p>
              <p style="margin:8px 0 0;color:#6b7280;font-size:12px;">${escapeHtml(footerText)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const textProject: string[] = []
  if (projectAddress && String(projectAddress).trim()) textProject.push(`Location: ${projectAddress}`)

  const lines = safeTasks
    .map((task, idx) => {
      const meta = taskMetaLine(task, sentAt, calendarTimeZone)
      const head = `- ${idx + 1}. ${task.title}`
      if (safeTasks.length === 1 && ctaUrl && reviewLinkText) {
        const metaPart = meta ? ` — ${meta}` : ''
        return `${head}${metaPart} — ${reviewLinkText}: ${ctaUrl}`
      }
      return `${head}${meta ? ` — ${meta}` : ''}`
    })
    .join('\n')

  const textMultiLink =
    safeTasks.length > 1 && ctaUrl && reviewLinkText ? `${reviewLinkText}: ${ctaUrl}` : ''

  const textParts: string[] = [mastheadTitle, '', ...textProject, '']
  if (!omitLeadBlock) {
    textParts.push(reminderHeadline || heading, subheading, '')
  }
  if (showSummaryRow) {
    textParts.push(`${summaryLabel}: ${summaryValue}`, '')
  }
  textParts.push(`${sectionTitle}:`, lines || '- No tasks in this window.')
  if (textMultiLink) {
    textParts.push('', textMultiLink)
  }
  textParts.push('', recipientName ? `Hi ${recipientName},` : 'Hi there,', footerText)

  const text = textParts.filter((line) => line !== '').join('\n')

  return { html, text }
}
