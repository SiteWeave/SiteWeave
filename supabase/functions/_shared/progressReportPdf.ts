/**
 * PDF filename + image helpers for progress report exports.
 * Prefer schedule `name` (report name); fall back to email subject.
 */

export type ProgressReportPhotoRef = {
  caption?: string | null
  thumbnail_url?: string | null
  full_url?: string | null
  is_completion_photo?: boolean
}

export type ProgressReportPhotoGroup = {
  label: string
  photos: ProgressReportPhotoRef[]
}

export function defaultProgressReportPdfFilename(reportName: string, subject = ''): string {
  const primary = String(reportName ?? '').trim()
  const fallback = String(subject ?? '').trim()
  const raw = primary || fallback || 'progress-report'
  const base =
    raw
      .replace(/[^\w\s-]/g, '')
      .trim()
      .slice(0, 80) || 'progress-report'
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

function photoUrl(photo: ProgressReportPhotoRef | null | undefined): string | null {
  if (!photo) return null
  const url = photo.thumbnail_url || photo.full_url || null
  return typeof url === 'string' && url.trim() ? url.trim() : null
}

function pushTaskPhotoGroups(
  groups: ProgressReportPhotoGroup[],
  tasks: Array<{ text?: string; title?: string; photos?: ProgressReportPhotoRef[] }> | null | undefined,
  projectPrefix?: string | null,
) {
  for (const task of tasks || []) {
    const photos = (task.photos || []).filter((p) => photoUrl(p))
    if (photos.length === 0) continue
    const taskLabel = String(task.text || task.title || 'Task').trim() || 'Task'
    const label = projectPrefix ? `${projectPrefix}: ${taskLabel}` : taskLabel
    groups.push({ label, photos })
  }
}

/** Collect completed + snapshot open-task photo groups from filtered report data. */
export function collectProgressReportPhotoGroups(reportData: Record<string, unknown> | null | undefined): ProgressReportPhotoGroup[] {
  if (!reportData) return []
  const groups: ProgressReportPhotoGroup[] = []
  const slices = Array.isArray(reportData.org_project_slices)
    ? (reportData.org_project_slices as Array<Record<string, unknown>>)
    : null

  if (slices && slices.length > 0) {
    for (const slice of slices) {
      const projectName = String(slice.project_name || 'Project')
      pushTaskPhotoGroups(groups, slice.completed_tasks as any, projectName)
      pushTaskPhotoGroups(groups, slice.last_week_done as any, projectName)
      const snap = slice.snapshot as { open_tasks?: any[] } | undefined
      pushTaskPhotoGroups(groups, snap?.open_tasks, projectName)
    }
    return groups
  }

  pushTaskPhotoGroups(groups, reportData.completed_tasks as any)
  pushTaskPhotoGroups(groups, reportData.last_week_done as any)
  const snap = reportData.snapshot as { open_tasks?: any[] } | undefined
  pushTaskPhotoGroups(groups, snap?.open_tasks)
  return groups
}

const IMAGE_FETCH_TIMEOUT_MS = 15_000
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** Exact hostname from SUPABASE_URL — only this host may be fetched for report images. */
function getAllowedImageFetchHostname(): string | null {
  const base = String(Deno.env.get('SUPABASE_URL') || '').trim()
  if (!base) return null
  try {
    const u = new URL(base)
    if (u.protocol !== 'https:') return null
    return u.hostname.toLowerCase()
  } catch {
    return null
  }
}

function isAllowedImageFetchUrl(urlString: string): boolean {
  const allowedHost = getAllowedImageFetchHostname()
  if (!allowedHost) return false
  try {
    const u = new URL(urlString)
    return u.protocol === 'https:' && u.hostname.toLowerCase() === allowedHost
  } catch {
    return false
  }
}

/** HTTPS + exact project host; follow one same-host redirect (signed storage URLs). */
async function fetchAllowedImageResponse(url: string): Promise<Response | null> {
  if (!isAllowedImageFetchUrl(url)) {
    console.warn('progressReportPdf: blocked image fetch to non-allowlisted host')
    return null
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS)
  try {
    let res = await fetch(url, { redirect: 'manual', signal: controller.signal })
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location || !isAllowedImageFetchUrl(new URL(location, url).toString())) {
        console.warn('progressReportPdf: blocked redirected image fetch', res.status)
        return null
      }
      res = await fetch(new URL(location, url).toString(), {
        redirect: 'manual',
        signal: controller.signal,
      })
      if (res.status >= 300 && res.status < 400) {
        console.warn('progressReportPdf: blocked multi-hop image redirect', res.status)
        return null
      }
    }
    if (!res.ok) return null
    return res
  } catch (err) {
    console.error('progressReportPdf: image fetch failed', err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchUrlAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetchAllowedImageResponse(url)
    if (!res) return null
    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim() || 'image/jpeg'
    if (!contentType.startsWith('image/')) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return `data:${contentType};base64,${btoa(binary)}`
  } catch (err) {
    console.error('progressReportPdf: failed to fetch image for data URI', err)
    return null
  }
}

/**
 * Replace remote <img src="..."> with data URIs so PDF/print captures do not depend on
 * network timing or CORS when Chromium/html2canvas renders the report.
 */
export async function inlineRemoteImagesInHtml(html: string): Promise<string> {
  if (!html || typeof html !== 'string') return html
  const srcPattern = /(<img\b[^>]*?\bsrc=["'])(https?:\/\/[^"']+)(["'][^>]*>)/gi
  const matches = [...html.matchAll(srcPattern)]
  if (matches.length === 0) return html

  const uniqueUrls = [...new Set(matches.map((m) => m[2]))]
  const dataUriByUrl = new Map<string, string>()
  await Promise.all(
    uniqueUrls.map(async (url) => {
      const dataUri = await fetchUrlAsDataUri(url)
      if (dataUri) dataUriByUrl.set(url, dataUri)
    }),
  )

  if (dataUriByUrl.size === 0) return html

  return html.replace(srcPattern, (full, prefix, url, suffix) => {
    const dataUri = dataUriByUrl.get(url)
    return dataUri ? `${prefix}${dataUri}${suffix}` : full
  })
}

/**
 * Print CSS (+ optional sticky Save as PDF bar) for the same branded HTML the app exports.
 * Screen toolbar is hidden when printing / printToPDF.
 */
export function injectProgressReportPrintChrome(
  html: string,
  options: { showSaveToolbar?: boolean } = {},
): string {
  const showSaveToolbar = options.showSaveToolbar === true
  const toolbar = showSaveToolbar
    ? `<div class="siteweave-print-toolbar" style="position:sticky;top:0;z-index:9999;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:#0f172a;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.4;box-sizing:border-box;">
  <span style="opacity:0.92;max-width:42rem;">Same branded report as SiteWeave. Click <strong>Save as PDF</strong>, then choose “Save as PDF” / “Microsoft Print to PDF” in the print dialog.</span>
  <button type="button" onclick="window.print()" style="cursor:pointer;border:0;border-radius:6px;background:#3b82f6;color:#ffffff;font-weight:600;font-size:13px;padding:8px 14px;flex-shrink:0;">Save as PDF</button>
</div>`
    : ''

  const styles = `<style>
@media print {
  @page { size: A4; margin: 12mm; }
  html, body {
    height: auto !important;
    min-height: 0 !important;
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .siteweave-print-toolbar { display: none !important; }
  /* Do not force height:auto — that collapsed fixed thumbnails and stacked captions over photos. */
  img {
    max-width: 100% !important;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  img[width="120"][height="90"] {
    width: 120px !important;
    height: 90px !important;
    object-fit: cover !important;
  }
  table { border-collapse: collapse !important; }
  tr, td { page-break-inside: avoid; break-inside: avoid; }
  ul, li { page-break-inside: avoid; break-inside: avoid; }
  p { orphans: 3; widows: 3; }
}
@media screen {
  body { margin: 0; background: #f3f4f6; }
}
</style>`

  let out = String(html || '')
  if (out.includes('<head>')) {
    out = out.replace('<head>', `<head>${styles}`)
  } else {
    out = `<!DOCTYPE html><html><head><meta charset="utf-8"/>${styles}</head><body>${out}</body></html>`
  }

  if (!toolbar) return out

  if (/<body\b[^>]*>/i.test(out)) {
    return out.replace(/<body\b[^>]*>/i, (open) => `${open}${toolbar}`)
  }
  return `${toolbar}${out}`
}

/** Print-ready HTML matching in-app PDF export (optionally with Save as PDF toolbar). */
export async function prepareProgressReportPrintHtml(
  html: string,
  options: { showSaveToolbar?: boolean; inlineImages?: boolean } = {},
): Promise<string> {
  const withChrome = injectProgressReportPrintChrome(html, {
    showSaveToolbar: options.showSaveToolbar === true,
  })
  if (options.inlineImages === false) return withChrome
  return inlineRemoteImagesInHtml(withChrome)
}

/** Secret used for email "Save as PDF" links (HMAC). Falls back to service role key. */
export function getProgressReportExportLinkSecret(): string {
  return (
    (Deno.env.get('PROGRESS_REPORT_EXPORT_LINK_SECRET') || '').trim() ||
    (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
  )
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
  return base64UrlEncode(signature)
}

/**
 * Signed GET URL for `export-progress-report-pdf` — same branded HTML as in-app export.
 * Avoids uploading HTML to storage buckets (mime-type restrictions historically broke email sends).
 */
export async function createSignedProgressReportExportUrl(opts: {
  supabaseUrl: string
  scheduleId: string
  ttlSeconds: number
  secret?: string
}): Promise<string> {
  const secret = (opts.secret || getProgressReportExportLinkSecret()).trim()
  if (!secret) {
    throw new Error('Missing PROGRESS_REPORT_EXPORT_LINK_SECRET (or SUPABASE_SERVICE_ROLE_KEY)')
  }
  const scheduleId = String(opts.scheduleId || '').trim()
  if (!scheduleId) throw new Error('Missing schedule_id for export link')

  const ttl = Number.isFinite(opts.ttlSeconds) ? Math.trunc(opts.ttlSeconds) : 0
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttl)
  const sig = await signPayload(`${scheduleId}:${exp}`, secret)
  const base = String(opts.supabaseUrl || '').replace(/\/$/, '')
  if (!base) throw new Error('Missing SUPABASE_URL for export link')

  const qs = new URLSearchParams({
    schedule_id: scheduleId,
    exp: String(exp),
    sig,
  })
  return `${base}/functions/v1/export-progress-report-pdf?${qs.toString()}`
}

export async function isValidSignedProgressReportExportRequest(
  url: URL,
  secret = getProgressReportExportLinkSecret(),
): Promise<boolean> {
  const scheduleId = url.searchParams.get('schedule_id')?.trim()
  const expRaw = url.searchParams.get('exp')?.trim()
  const sig = url.searchParams.get('sig')?.trim()
  if (!scheduleId || !expRaw || !sig || !secret) return false
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  const expected = await signPayload(`${scheduleId}:${exp}`, secret)
  return expected === sig
}

export async function fetchImageBytesForPdf(url: string): Promise<{ bytes: Uint8Array; kind: 'jpg' | 'png' } | null> {
  try {
    const res = await fetchAllowedImageResponse(url)
    if (!res) return null
    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null

    if (contentType.includes('png') || looksLikePng(bytes)) {
      return { bytes, kind: 'png' }
    }
    if (
      contentType.includes('jpeg') ||
      contentType.includes('jpg') ||
      looksLikeJpeg(bytes)
    ) {
      return { bytes, kind: 'jpg' }
    }
    // WebP / other formats are unsupported by pdf-lib Standard embedders
    return null
  } catch (err) {
    console.error('progressReportPdf: failed to fetch image bytes', err)
    return null
  }
}

function looksLikePng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
}

function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8
}
