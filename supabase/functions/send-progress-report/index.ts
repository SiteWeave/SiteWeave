// Supabase Edge Function: Send Progress Report
// Sends progress report emails with approval workflow support

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getBearerToken, isServiceRoleToken } from '../_shared/auth.ts'
import { buildProgressReportEmail } from '../_shared/progressReportEmailTemplates.ts'
import { buildBrandedProgressReportPdf } from '../_shared/buildProgressReportPdf.ts'
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

    const token = getBearerToken(req) ?? ''
    const isServiceRole = isServiceRoleToken(token)

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
      // Real application/pdf only (never text/html — bucket mime rules broke that before).
      reportExportUrl = await createReportExportUrl({
        supabase,
        schedule,
        subject: emailContent.subject,
        reportData: (filtered_data || {}) as Record<string, unknown>,
        branding: {
          ...brandingData,
          organization_name:
            (filtered_data as { organization_name?: string } | undefined)?.organization_name ||
            (report_data as { organization_name?: string } | undefined)?.organization_name ||
            null,
        },
      })
    } catch (exportError) {
      reportExportError = exportError instanceof Error ? exportError.message : String(exportError)
      console.error('Progress report PDF export link generation failed (email will still send):', exportError)
    }

    const emailHtmlBase = reportExportUrl
      ? injectProgressReportExportButton(emailContent.html, reportExportUrl)
      : emailContent.html
    const emailTextBase = reportExportUrl
      ? `${emailContent.text}\n\nDownload PDF: ${reportExportUrl}`
      : emailContent.text

    // Determine recipients (null-safe: relation may be missing or empty)
    const rawRecipients = (schedule.progress_report_recipients || []) as Array<{
      id?: string
      email?: string
      is_active?: boolean
      unsubscribe_token?: string | null
    }>
    type SendTarget = { email: string; unsubscribeUrl?: string | null }
    const sendTargets: SendTarget[] = []

    if (is_test && test_email) {
      sendTargets.push({ email: test_email, unsubscribeUrl: null })
    } else {
      const base = appBaseUrl()
      for (const row of rawRecipients) {
        if (row.is_active === false || !row.email) continue
        let token = row.unsubscribe_token || null
        if (!token && row.id) {
          token = newUnsubscribeToken()
          const { error: tokenError } = await supabase
            .from('progress_report_recipients')
            .update({ unsubscribe_token: token })
            .eq('id', row.id)
          if (tokenError) {
            console.warn('Could not persist unsubscribe_token:', tokenError.message)
            token = null
          }
        }
        sendTargets.push({
          email: row.email,
          unsubscribeUrl: token ? `${base}/unsubscribe/progress-report/${token}` : null,
        })
      }
    }

    const recipients = sendTargets.map((t) => t.email)

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

    // Send email via Resend (per recipient when unsubscribe links are present)
    let emailId = null
    if (RESEND_API_KEY) {
      const sendErrors: Array<{ email: string; error: unknown }> = []
      for (const target of sendTargets) {
        const html = target.unsubscribeUrl
          ? injectProgressReportUnsubscribe(emailHtmlBase, target.unsubscribeUrl)
          : emailHtmlBase
        const text = target.unsubscribeUrl
          ? `${emailTextBase}\n\nUnsubscribe: ${target.unsubscribeUrl}`
          : emailTextBase
        const headers: Record<string, string> = {}
        if (target.unsubscribeUrl) {
          headers['List-Unsubscribe'] = `<${target.unsubscribeUrl}>`
          headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
        }

        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [target.email],
            subject: emailContent.subject,
            html,
            text,
            ...(Object.keys(headers).length ? { headers } : {}),
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
          console.error('Resend error:', target.email, resendData)
          sendErrors.push({ email: target.email, error: resendData })
          continue
        }
        emailId = resendData.id || emailId
      }

      if (sendErrors.length === sendTargets.length) {
        return new Response(
          JSON.stringify({ error: 'Failed to send email via Resend', details: sendErrors }),
          { 
            status: 500, 
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders
            } 
          }
        )
      }
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
      const { sendHour, timeZone } = resolveScheduleSendSettings(schedule)
      const nextSendDate = calculateNextSendDate(
        schedule.frequency,
        schedule.frequency_value,
        new Date().toISOString(),
        sendHour,
        timeZone,
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
function resolveScheduleSendSettings(
  schedule: { send_hour?: number | null; send_timezone?: string | null },
  orgFallback?: { sendHour?: number; timeZone?: string } | null,
) {
  const sendHour = Number.isFinite(Number(schedule?.send_hour))
    ? Math.max(0, Math.min(23, Number(schedule.send_hour)))
    : Number.isFinite(Number(orgFallback?.sendHour))
      ? Number(orgFallback!.sendHour)
      : 8
  const timeZone =
    typeof schedule?.send_timezone === 'string' && schedule.send_timezone
      ? schedule.send_timezone
      : typeof orgFallback?.timeZone === 'string' && orgFallback.timeZone
        ? orgFallback.timeZone
        : 'America/New_York'
  return { sendHour, timeZone }
}

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

function injectProgressReportExportButton(html: string, reportExportUrl: string): string {
  const safeUrl = reportExportUrl.replace(/"/g, '&quot;')
  const pdfCell = `<td style="vertical-align:middle;text-align:right;padding-left:16px;white-space:nowrap;">
  <a href="${safeUrl}" target="_blank" rel="noreferrer" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;padding:8px 14px;border-radius:6px;">Download PDF</a>
</td>`

  // Remove legacy top-of-email PDF callout if present in cached HTML
  const withoutLegacyCta = html.replace(
    /<div style="margin:0 0 22px;padding:16px;border:1px solid #dbeafe;border-radius:8px;background:#eff6ff;">[\s\S]*?<\/div>/,
    '',
  )

  if (withoutLegacyCta.includes('<!-- siteweave-pdf-footer-slot -->')) {
    return withoutLegacyCta.replace('<!-- siteweave-pdf-footer-slot -->', pdfCell)
  }

  // Fallback for older templates without the slot marker
  return withoutLegacyCta.replace(
    /(<p style="margin:0;color:#9ca3af;font-size:11px;">Automated progress report from [^<]+<\/p>\s*<\/td>)(\s*<\/tr>)/,
    `$1${pdfCell}$2`,
  )
}

function injectProgressReportUnsubscribe(html: string, unsubscribeUrl: string): string {
  const safeUrl = unsubscribeUrl.replace(/"/g, '&quot;')
  const block = `<p style="margin:12px 0 0;color:#9ca3af;font-size:11px;line-height:1.5;">
    Don't want these emails?
    <a href="${safeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
  </p>`
  if (html.includes('<!-- siteweave-unsubscribe-slot -->')) {
    return html.replace('<!-- siteweave-unsubscribe-slot -->', block)
  }
  return `${html}${block}`
}

function appBaseUrl(): string {
  return (Deno.env.get('APP_URL') || Deno.env.get('VITE_APP_URL') || 'https://app.siteweave.org').replace(/\/+$/, '')
}

function newUnsubscribeToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
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

async function createReportExportUrl(opts: {
  supabase: ReturnType<typeof createClient>
  schedule: {
    organization_id?: string | null
    id?: string | null
    name?: string | null
    custom_subject?: string | null
    report_audience_type?: string | null
    report_sections?: Record<string, unknown> | null
  }
  subject: string
  reportData: Record<string, unknown>
  branding: {
    logo_url?: string | null
    primary_color?: string | null
    secondary_color?: string | null
    company_footer?: string | null
    organization_name?: string | null
  }
}) {
  const disallowedExportBuckets = new Set(['task_photos'])
  const candidateBuckets = Array.from(
    new Set([REPORT_EXPORT_BUCKET, REPORT_EXPORT_FALLBACK_BUCKET, DEFAULT_REPORT_EXPORT_BUCKET].filter(Boolean)),
  ).filter((bucketName) => !disallowedExportBuckets.has(bucketName))
  const org = String(opts.schedule.organization_id || 'org')
  const scheduleId = String(opts.schedule.id || 'schedule')

  const pdfBytes = await buildBrandedProgressReportPdf({
    subject: opts.subject,
    reportData: opts.reportData,
    schedule: opts.schedule,
    branding: opts.branding,
  })

  const filename = defaultProgressReportPdfFilename(String(opts.schedule.name ?? ''), opts.subject)
  let lastError: string | null = null

  for (const bucketName of candidateBuckets) {
    try {
      await ensureReportExportBucket(opts.supabase, bucketName)
      const objectPath = `${org}/${scheduleId}/${Date.now()}-${crypto.randomUUID()}-${filename}`
      const { error: uploadError } = await opts.supabase.storage
        .from(bucketName)
        .upload(objectPath, pdfBytes, {
          contentType: 'application/pdf',
          cacheControl: '86400',
          upsert: false,
        })
      if (uploadError) {
        lastError = `upload failed in bucket "${bucketName}": ${uploadError.message}`
        console.error('Report PDF export upload failed', {
          bucketName,
          scheduleId,
          org,
          error: uploadError.message,
        })
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
