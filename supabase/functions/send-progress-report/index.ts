// Supabase Edge Function: Send Progress Report
// Sends progress report emails with approval workflow support

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import { buildProgressReportEmail } from '../_shared/progressReportEmailTemplates.ts'
import { defaultProgressReportPdfFilename } from '../_shared/progressReportPdf.ts'
import {
  callGenerateProgressReport,
  GenerateProgressReportError,
} from '../_shared/generateProgressReportClient.ts'
import { deepSanitizeForJson } from '../_shared/jsonSafe.ts'
import { assertHasFullTierAccess } from '../_shared/workspaceTier.ts'

// RESEND_API_KEY required to send. RESEND_FROM optional (verified domain in Resend). See docs/email-deliverability-resend.md (SPF/DKIM/DMARC).
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM =
  Deno.env.get('RESEND_FROM') ?? 'SiteWeave Notifications <notifications@siteweave.org>'
const RESEND_VERIFIED_DOMAIN = (Deno.env.get('RESEND_VERIFIED_DOMAIN') || '').trim().toLowerCase()
const DEFAULT_REPORT_EXPORT_BUCKET = 'progress_report_exports'
const REPORT_EXPORT_BUCKET = (Deno.env.get('PROGRESS_REPORT_EXPORT_BUCKET') || DEFAULT_REPORT_EXPORT_BUCKET).trim()
const REPORT_EXPORT_FALLBACK_BUCKET = (Deno.env.get('PROGRESS_REPORT_EXPORT_FALLBACK_BUCKET') || '').trim()
const REPORT_EXPORT_LINK_TTL_DEFAULT_SECONDS = 60 * 60 * 24 * 90
const REPORT_EXPORT_LINK_TTL_MIN_SECONDS = 60
const REPORT_EXPORT_LINK_TTL_MAX_SECONDS = 60 * 60 * 24 * 365
const REPORT_EXPORT_LINK_TTL_SECONDS = resolveReportExportLinkTtlSeconds(
  Deno.env.get('PROGRESS_REPORT_EXPORT_LINK_TTL_SECONDS'),
)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function resolveReportExportLinkTtlSeconds(rawValue: string | undefined): number {
  const parsed = Number(rawValue)
  const finite = Number.isFinite(parsed) ? Math.trunc(parsed) : REPORT_EXPORT_LINK_TTL_DEFAULT_SECONDS
  return Math.max(REPORT_EXPORT_LINK_TTL_MIN_SECONDS, Math.min(REPORT_EXPORT_LINK_TTL_MAX_SECONDS, finite))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: corsHeaders
    })
  }

  try {
    const body = await req.json()
    const { schedule_id, test_email, is_test, is_manual } = body

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const isServiceRole = token === supabaseServiceKey

    let callerUserId: string | null = null
    if (!isServiceRole) {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Missing authorization' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }
      if (!supabaseAnonKey) {
        return new Response(JSON.stringify({ error: 'Server misconfiguration: missing anon key' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }
      const supabaseJwt = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data: { user }, error: jwtError } = await supabaseJwt.auth.getUser(token)
      if (jwtError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired session. Sign in again.' }),
          { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }
      callerUserId = user.id
    }

    if (!schedule_id) {
      return new Response(
        JSON.stringify({ error: 'Missing schedule_id' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          } 
        }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const fromEmailMatch = RESEND_FROM.match(/<([^>]+)>/)
    const fromEmail = (fromEmailMatch?.[1] || RESEND_FROM).trim().toLowerCase()
    const fromDomain = fromEmail.includes('@') ? fromEmail.split('@').pop() : ''
    if (!fromDomain) {
      return new Response(
        JSON.stringify({ error: 'Invalid RESEND_FROM format. Use "Name <address@domain.com>".' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if (RESEND_VERIFIED_DOMAIN && fromDomain !== RESEND_VERIFIED_DOMAIN) {
      return new Response(
        JSON.stringify({
          error: `Sender domain mismatch. RESEND_FROM uses ${fromDomain} but RESEND_VERIFIED_DOMAIN is ${RESEND_VERIFIED_DOMAIN}.`,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // Fetch schedule configuration
    const { data: schedule, error: scheduleError } = await supabase
      .from('progress_report_schedules')
      .select('*, progress_report_recipients(*)')
      .eq('id', schedule_id)
      .single()

    if (scheduleError || !schedule) {
      return new Response(
        JSON.stringify({ error: 'Schedule not found' }),
        { 
          status: 404, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          } 
        }
      )
    }

    const tierCheck = await assertHasFullTierAccess(supabase, schedule.organization_id)
    if (!tierCheck.ok) {
      return new Response(JSON.stringify({ error: tierCheck.error }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // User-initiated calls: must belong to the schedule's org and have permission
    if (!isServiceRole && callerUserId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, role_id, is_super_admin')
        .eq('id', callerUserId)
        .maybeSingle()

      if (!profile) {
        return new Response(JSON.stringify({ error: 'Profile not found' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }
      if (!profile.is_super_admin) {
        if (profile.organization_id !== schedule.organization_id) {
          return new Response(JSON.stringify({ error: 'Not allowed for this organization' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          })
        }
        if (!profile.role_id) {
          return new Response(JSON.stringify({ error: 'No role assigned' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          })
        }
        const { data: roleRow } = await supabase
          .from('roles')
          .select('permissions')
          .eq('id', profile.role_id)
          .maybeSingle()

        const perms = roleRow?.permissions as Record<string, unknown> | undefined
        const canProjectReports = perms?.can_manage_progress_reports === true
        const canOrgReports = perms?.can_manage_org_progress_reports === true
        if (schedule.project_id == null) {
          if (!canOrgReports) {
            return new Response(
              JSON.stringify({
                error: 'Missing permission to send organization-wide progress reports (admins only)',
              }),
              { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
            )
          }
        } else if (!canProjectReports) {
          return new Response(
            JSON.stringify({ error: 'Missing permission to send progress reports' }),
            { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
          )
        }
      }
    }

    // Check approval status if required (skip for test sends and explicit manual sends)
    const skipApprovalCheck = is_test || is_manual
    if (!skipApprovalCheck && schedule.requires_approval && schedule.approval_status !== 'approved') {
      return new Response(
        JSON.stringify({ error: 'Report requires approval before sending' }),
        { 
          status: 403, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          } 
        }
      )
    }

    let generateResult: Record<string, unknown>
    try {
      generateResult = await callGenerateProgressReport({
        supabaseUrl,
        supabaseServiceKey,
        scheduleId: schedule_id,
      })
    } catch (err) {
      if (err instanceof GenerateProgressReportError) {
        return new Response(JSON.stringify({ error: err.message, details: err.details }), {
          status: err.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }
      throw err
    }

    const report_data = generateResult?.report_data
    const filtered_data = generateResult?.filtered_data

    // Fetch organization branding
    const { data: branding } = await supabase
      .from('organization_branding')
      .select('*')
      .eq('organization_id', schedule.organization_id)
      .maybeSingle()
    const { data: organization, error: organizationError } = await supabase
      .from('organizations')
      .select('progress_report_send_hour, progress_report_timezone')
      .eq('id', schedule.organization_id)
      .maybeSingle()
    if (organizationError) {
      console.warn('Unable to load org progress report schedule settings:', organizationError.message)
    }

    const brandingData = branding || {
      logo_url: null,
      primary_color: '#3B82F6',
      secondary_color: '#10B981',
      company_footer: null,
      email_signature: null
    }

    const emailContent = buildProgressReportEmail(
      report_data as Record<string, unknown>,
      filtered_data as Record<string, unknown>,
      schedule,
      brandingData,
    )
    let reportExportUrl: string | null = null
    let reportExportError: string | null = null
    try {
      reportExportUrl = await createReportExportUrl({
        supabase,
        schedule,
        subject: emailContent.subject,
        text: emailTextToPdfText(emailContent.text),
      })
    } catch (exportError) {
      reportExportError = exportError instanceof Error ? exportError.message : String(exportError)
      console.error('Progress report PDF export link generation failed (email will still send):', exportError)
    }

    const emailHtml = reportExportUrl
      ? injectProgressReportExportButton(emailContent.html, reportExportUrl)
      : emailContent.html
    const emailText = reportExportUrl
      ? `${emailContent.text}\n\nOpen print-ready report: ${reportExportUrl}`
      : emailContent.text

    // Determine recipients (null-safe: relation may be missing or empty)
    const rawRecipients = schedule.progress_report_recipients || []
    let recipients: string[] = []
    if (is_test && test_email) {
      recipients = [test_email]
    } else {
      recipients = rawRecipients
        .filter((r: { is_active?: boolean }) => r.is_active !== false)
        .map((r: { email: string }) => r.email)
        .filter(Boolean)
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No recipients configured' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          } 
        }
      )
    }

    // Send email via Resend
    let emailId = null
    if (RESEND_API_KEY) {
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: recipients,
          subject: emailContent.subject,
          html: emailHtml,
          text: emailText,
        })
      })

      const resendRaw = await resendResponse.text()
      let resendData: Record<string, unknown> = {}
      if (resendRaw) {
        try {
          resendData = JSON.parse(resendRaw) as Record<string, unknown>
        } catch {
          resendData = { raw: resendRaw.slice(0, 500) }
        }
      }

      if (!resendResponse.ok) {
        console.error('Resend error:', resendData)
        return new Response(
          JSON.stringify({ error: 'Failed to send email via Resend', details: resendData }),
          { 
            status: 500, 
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders
            } 
          }
        )
      }

      emailId = resendData.id
    } else {
      console.log('Email would be sent to:', recipients)
      console.log('Subject:', emailContent.subject)
      if (reportExportUrl) console.log('Report export URL:', reportExportUrl)
    }

    // Record in history (skip for test sends). Payloads omit all_tasks/all_phases from generate-progress-report.
    if (!is_test) {
      await supabase
        .from('progress_report_history')
        .insert({
          schedule_id: schedule.id,
          report_audience_type: schedule.report_audience_type,
          report_type: schedule.project_id ? 'project' : 'organization',
          project_id: schedule.project_id,
          organization_id: schedule.organization_id,
          recipient_emails: recipients,
          report_data: deepSanitizeForJson(report_data),
          filtered_data: deepSanitizeForJson(filtered_data),
          sent_by_user_id: schedule.created_by_user_id,
          email_id: emailId,
          was_manual_send: is_manual || false
        })

      // Update schedule
      const nextSendDate = calculateNextSendDate(
        schedule.frequency,
        schedule.frequency_value,
        new Date().toISOString(),
        Number.isFinite(Number(organization?.progress_report_send_hour))
          ? Number(organization?.progress_report_send_hour)
          : 8,
        typeof organization?.progress_report_timezone === 'string' && organization.progress_report_timezone
          ? organization.progress_report_timezone
          : 'America/New_York',
      )

      await supabase
        .from('progress_report_schedules')
        .update({
          last_sent_at: new Date().toISOString(),
          next_send_at: nextSendDate ? nextSendDate.toISOString() : null
        })
        .eq('id', schedule_id)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        email_id: emailId,
        recipients_count: recipients.length,
        is_test: is_test || false,
        report_export_url: reportExportUrl,
        report_export_error: reportExportError,
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        } 
      }
    )

  } catch (error) {
    console.error('Error in send-progress-report:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ error: msg }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        } 
      }
    )
  }
})

// frequency_value: weekly/bi-weekly = day of week 0-6 (0=Sunday); monthly = 1, 15, or -1 (last day)
function calculateNextSendDate(
  frequency,
  frequencyValue,
  lastSentAt,
  sendHourLocal = 8,
  timeZone = 'America/New_York',
) {
  const baseDate = new Date(lastSentAt)
  const safeHour = Number.isFinite(Number(sendHourLocal))
    ? Math.max(0, Math.min(23, Number(sendHourLocal)))
    : 8
  const dayOfWeek = frequencyValue != null && frequencyValue >= 0 && frequencyValue <= 6 ? frequencyValue : 0
  const baseLocalDate = getLocalCalendarDate(baseDate, timeZone)
  const withLocalHour = (value: Date) => zonedDateTimeToUtc({
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    hour: safeHour,
    minute: 0,
    second: 0,
  }, timeZone)

  switch (frequency) {
    case 'weekly': {
      const next = new Date(baseLocalDate)
      next.setUTCDate(next.getUTCDate() + 7)
      while (next.getUTCDay() !== dayOfWeek) next.setUTCDate(next.getUTCDate() + 1)
      return withLocalHour(next)
    }
    case 'bi-weekly': {
      const next = new Date(baseLocalDate)
      next.setUTCDate(next.getUTCDate() + 14)
      while (next.getUTCDay() !== dayOfWeek) next.setUTCDate(next.getUTCDate() + 1)
      return withLocalHour(next)
    }
    case 'monthly': {
      const y = baseLocalDate.getUTCFullYear()
      const m = baseLocalDate.getUTCMonth()
      if (frequencyValue === -1 || frequencyValue === 31) {
        return withLocalHour(new Date(Date.UTC(y, m + 2, 0)))
      }
      if (frequencyValue === 15) {
        return withLocalHour(new Date(Date.UTC(y, m + 1, 15)))
      }
      return withLocalHour(new Date(Date.UTC(y, m + 1, 1)))
    }
    case 'custom':
      if (frequencyValue && frequencyValue > 0) {
        const next = new Date(baseLocalDate)
        next.setUTCDate(next.getUTCDate() + frequencyValue)
        return withLocalHour(next)
      }
      return null
    case 'manual':
      return null
    default:
      return null
  }
}

function getLocalCalendarDate(date: Date, timeZone: string) {
  const parts = getDateTimeParts(date, timeZone)
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

function getDateTimeParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const mapped = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return {
    year: Number(mapped.year),
    month: Number(mapped.month),
    day: Number(mapped.day),
    hour: Number(mapped.hour),
    minute: Number(mapped.minute),
    second: Number(mapped.second),
  }
}

function zonedDateTimeToUtc(
  desired: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string,
) {
  let utcGuess = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second,
  )

  for (let i = 0; i < 3; i += 1) {
    const actual = getDateTimeParts(new Date(utcGuess), timeZone)
    const desiredAsUtc = Date.UTC(
      desired.year,
      desired.month - 1,
      desired.day,
      desired.hour,
      desired.minute,
      desired.second,
    )
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    )
    utcGuess += desiredAsUtc - actualAsUtc
  }

  return new Date(utcGuess)
}

function injectPrintStyles(html: string): string {
  const extra = `<style>
@media print {
  @page { size: A4; margin: 12mm; }
  html, body {
    height: auto !important;
    min-height: 0 !important;
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>`
  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>${extra}`)
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${extra}</head><body>${html}</body></html>`
}

function injectProgressReportExportButton(html: string, reportExportUrl: string): string {
  const safeUrl = reportExportUrl.replace(/"/g, '&quot;')
  const cta = `
<div style="margin:0 0 22px;padding:16px;border:1px solid #dbeafe;border-radius:8px;background:#eff6ff;">
  <p style="margin:0 0 10px;font-size:13px;color:#1e3a8a;font-weight:600;">Need the PDF version?</p>
  <a href="${safeUrl}" target="_blank" rel="noreferrer" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 14px;border-radius:6px;">Open PDF report</a>
</div>`
  const anchor = '<div style="padding:8px 0 20px;">'
  if (html.includes(anchor)) return html.replace(anchor, `${anchor}${cta}`)
  return html.replace('</body>', `${cta}</body>`)
}

async function ensureReportExportBucket(supabase: ReturnType<typeof createClient>, bucketName: string) {
  const { data: bucketsBefore } = await supabase.storage.listBuckets()
  if ((bucketsBefore || []).some((b: { id?: string }) => b?.id === bucketName)) return

  const { error } = await supabase.storage.createBucket(bucketName, {
    public: false,
  })
  if (!error) return

  const { data: bucketsAfter } = await supabase.storage.listBuckets()
  if ((bucketsAfter || []).some((b: { id?: string }) => b?.id === bucketName)) return

  const msg = String(error.message || '').toLowerCase()
  if (msg.includes('exists') || msg.includes('duplicate')) return
  throw new Error(`Could not create storage bucket "${bucketName}": ${error.message}`)
}

function defaultProgressReportExportFilename(
  schedule: { name?: string | null },
  subject: string,
): string {
  return defaultProgressReportPdfFilename(String(schedule?.name ?? ''), subject)
}

async function createReportExportUrl(opts: {
  supabase: ReturnType<typeof createClient>
  schedule: { organization_id?: string | null; id?: string | null; name?: string | null }
  subject: string
  text: string
}) {
  const disallowedExportBuckets = new Set(['task_photos'])
  const candidateBuckets = Array.from(
    new Set([REPORT_EXPORT_BUCKET, REPORT_EXPORT_FALLBACK_BUCKET, DEFAULT_REPORT_EXPORT_BUCKET].filter(Boolean)),
  ).filter((bucketName) => !disallowedExportBuckets.has(bucketName))
  const org = String(opts.schedule.organization_id || 'org')
  const scheduleId = String(opts.schedule.id || 'schedule')
  const pdfBytes = await buildProgressReportPdfBytes({
    subject: opts.subject,
    text: opts.text,
  })
  let lastError: string | null = null

  for (const bucketName of candidateBuckets) {
    try {
      await ensureReportExportBucket(opts.supabase, bucketName)
      const objectPath = `${org}/${scheduleId}/${Date.now()}-${crypto.randomUUID()}-${defaultProgressReportExportFilename(opts.schedule, opts.subject)}`
      const { error: uploadError } = await opts.supabase.storage
        .from(bucketName)
        .upload(objectPath, pdfBytes, {
          contentType: 'application/pdf',
          cacheControl: '86400',
          upsert: false,
        })
      if (uploadError) {
        lastError = `upload failed in bucket "${bucketName}": ${uploadError.message}`
        console.error('Report PDF export upload failed', { bucketName, scheduleId, org, error: uploadError.message })
        continue
      }

      const { data: signed, error: signedError } = await opts.supabase.storage
        .from(bucketName)
        .createSignedUrl(objectPath, REPORT_EXPORT_LINK_TTL_SECONDS)
      if (signedError || !signed?.signedUrl) {
        lastError = `signed URL failed in bucket "${bucketName}": ${signedError?.message || 'Unknown storage error'}`
        console.error('Report PDF export signed URL failed', {
          bucketName,
          scheduleId,
          org,
          objectPath,
          ttlSeconds: REPORT_EXPORT_LINK_TTL_SECONDS,
          error: signedError?.message || 'Unknown storage error',
        })
        continue
      }
      return signed.signedUrl
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      console.error('Report export bucket attempt failed', {
        bucketName,
        scheduleId,
        org,
        error: lastError,
      })
    }
  }
  throw new Error(lastError || 'Failed to create report export link')
}

/** pdf-lib StandardFonts (WinAnsi) cannot encode many Unicode glyphs; strip/replace before measureText/drawText. */
function sanitizePdfLibText(text: string): string {
  const replaced = String(text || '')
    .replace(/\u2192/g, '->')
    .replace(/\u27f6/g, '->')
    .replace(/\u2713|\u2714|\u2611/g, '[x]')
    .replace(/\u2610/g, '[ ]')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
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
  return out.replace(/ +(\n|$)/g, '$1').replace(/[ \t]+/g, ' ').trim()
}

function emailTextToPdfText(text: string): string {
  const body = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return sanitizePdfLibText(`${body}\n\nGenerated by SiteWeave`.trim())
}

async function buildProgressReportPdfBytes(opts: { subject: string; text: string }) {
  const pdfDoc = await PDFDocument.create()
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const pageWidth = 612
  const pageHeight = 792
  const margin = 54
  const bodyFontSize = 11
  const lineHeight = 16
  const sectionGap = 8
  const maxTextWidth = pageWidth - margin * 2

  let page = pdfDoc.addPage([pageWidth, pageHeight])
  let cursorY = pageHeight - margin

  const startNewPage = () => {
    page = pdfDoc.addPage([pageWidth, pageHeight])
    cursorY = pageHeight - margin
  }

  const ensureRoom = (heightNeeded: number) => {
    if (cursorY - heightNeeded < margin) startNewPage()
  }

  const drawWrappedLine = (text: string, font: typeof regularFont, size: number, color: ReturnType<typeof rgb>) => {
    const wrapped = wrapText(sanitizePdfLibText(text), font, size, maxTextWidth)
    for (const line of wrapped) {
      if (!line.trim()) {
        cursorY -= lineHeight / 2
        continue
      }
      ensureRoom(lineHeight)
      page.drawText(line, {
        x: margin,
        y: cursorY,
        size,
        font,
        color,
      })
      cursorY -= lineHeight
    }
  }

  drawWrappedLine(sanitizePdfLibText(opts.subject || 'Progress Report'), boldFont, 18, rgb(0.12, 0.23, 0.54))
  cursorY -= 6

  const blocks = String(opts.text || '').split(/\n\s*\n/g).map((block) => block.trim()).filter(Boolean)
  for (const block of blocks) {
    const isSection = /^[A-Za-z][A-Za-z\s&'/-]+:$/.test(block)
    if (isSection) {
      const heading = sanitizePdfLibText(block.replace(/:$/, ''))
      if (heading.trim()) {
        ensureRoom(lineHeight + sectionGap)
        page.drawText(heading, {
          x: margin,
          y: cursorY,
          size: 13,
          font: boldFont,
          color: rgb(0.11, 0.17, 0.26),
        })
        cursorY -= lineHeight
        cursorY -= 2
      }
      continue
    }

    for (const rawLine of block.split('\n')) {
      const line = rawLine.trimEnd()
      if (!line) {
        cursorY -= lineHeight / 2
        continue
      }
      drawWrappedLine(line, regularFont, bodyFontSize, rgb(0.2, 0.23, 0.27))
    }
    cursorY -= sectionGap
  }

  return await pdfDoc.save()
}

function wrapText(text: string, font: typeof PDFDocument.prototype['embedFont'] extends (...args: never[]) => Promise<infer T> ? T : never, fontSize: number, maxWidth: number) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
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
