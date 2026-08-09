// Supabase Edge Function: Export Progress Report for print / Save as PDF (client-side)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildProgressReportEmail } from '../_shared/progressReportEmailTemplates.ts'
import { buildBrandedProgressReportPdf } from '../_shared/buildProgressReportPdf.ts'
import {
  callGenerateProgressReport,
  GenerateProgressReportError,
} from '../_shared/generateProgressReportClient.ts'
import {
  defaultProgressReportPdfFilename,
  isValidSignedProgressReportExportRequest,
  prepareProgressReportPrintHtml,
} from '../_shared/progressReportPdf.ts'
import { assertCanExportProfessionalDocs, EXPORT_FEATURE_LOCKED_ERROR } from '../_shared/workspaceTier.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    })
  }

  const requestUrl = new URL(req.url)
  const signedAccess = req.method === 'GET' && await isValidSignedProgressReportExportRequest(requestUrl)

  const authHeader = req.headers.get('Authorization')
  if (!signedAccess && !authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
  let user: { id: string } | null = null
  if (!signedAccess) {
    const token = authHeader!.replace(/^Bearer\s+/i, '').trim()
    const authResult = await supabaseAuth.auth.getUser(token)
    user = authResult.data.user
    if (authResult.error || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
  }

  try {
    const schedule_id = req.method === 'GET'
      ? requestUrl.searchParams.get('schedule_id')
      : (await req.json()).schedule_id

    if (!schedule_id) {
      return new Response(JSON.stringify({ error: 'Missing schedule_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: schedule, error: scheduleError } = await supabase
      .from('progress_report_schedules')
      .select('*, progress_report_recipients(*)')
      .eq('id', schedule_id)
      .single()

    if (scheduleError || !schedule) {
      return new Response(JSON.stringify({ error: 'Schedule not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const exportTierCheck = await assertCanExportProfessionalDocs(supabase, schedule.organization_id)
    if (!exportTierCheck.ok) {
      return new Response(
        JSON.stringify({
          error: EXPORT_FEATURE_LOCKED_ERROR,
          message: 'PDF export is available on the business plan. Contact sales to upgrade.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    if (!signedAccess) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, role_id, is_super_admin')
        .eq('id', user!.id)
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
                error:
                  'Missing permission to export organization-wide progress reports (admins only)',
              }),
              {
                status: 403,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
              },
            )
          }
        } else if (!canProjectReports) {
          return new Response(JSON.stringify({ error: 'Missing permission to export progress reports' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          })
        }
      }
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
        const httpStatus =
          err.status >= 400 && err.status < 600 ? err.status : 502
        return new Response(
          JSON.stringify({
            error: err.message,
            details: err.details,
            generator_status: err.status,
          }),
          {
            status: httpStatus,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        )
      }
      throw err
    }

    const report_data = generateResult?.report_data as Record<string, unknown> | undefined
    const filtered_data = generateResult?.filtered_data as Record<string, unknown> | undefined

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
      email_signature: null,
    }

    const emailContent = buildProgressReportEmail(
      report_data,
      filtered_data,
      schedule,
      brandingData,
    )

    // Same branded HTML as in-app export. Signed GET (email links) gets a Save as PDF toolbar;
    // app POST path stays chrome-free for Electron / html2canvas.
    const html = await prepareProgressReportPrintHtml(emailContent.html, {
      showSaveToolbar: req.method === 'GET',
      inlineImages: true,
    })
    const reportName = String((schedule as { name?: string | null }).name ?? '')
    const suggested_pdf_filename = defaultProgressReportPdfFilename(reportName, emailContent.subject)
    const html_filename = suggested_pdf_filename.replace(/\.pdf$/i, '.html')

    let pdf_base64: string | null = null
    try {
      const pdfBytes = await buildBrandedProgressReportPdf({
        subject: emailContent.subject,
        reportData: (report_data || {}) as Record<string, unknown>,
        schedule: schedule as Record<string, unknown>,
        branding: brandingData,
      })
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < pdfBytes.length; i += chunk) {
        binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunk))
      }
      pdf_base64 = btoa(binary)
    } catch (pdfErr) {
      console.warn('Branded PDF bytes unavailable; client will fall back to HTML→PDF:', pdfErr)
    }

    if (req.method === 'GET') {
      const docHeaders = new Headers()
      docHeaders.set('Content-Type', 'text/html; charset=utf-8')
      docHeaders.set('Content-Disposition', `inline; filename="${html_filename.replace(/"/g, '')}"`)
      docHeaders.set('Cache-Control', 'no-store')
      docHeaders.set('Access-Control-Allow-Origin', '*')
      docHeaders.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type')
      docHeaders.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
      docHeaders.set('X-Content-Type-Options', 'nosniff')
      docHeaders.set('Referrer-Policy', 'no-referrer')
      docHeaders.set('X-SiteWeave-Export-Mode', 'inline-html-v3')
      return new Response(html, {
        status: 200,
        headers: docHeaders,
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        html,
        pdf_base64,
        subject: emailContent.subject,
        report_name: reportName,
        suggested_pdf_filename,
        message: pdf_base64
          ? 'Branded PDF bytes included; HTML retained as fallback.'
          : 'Client saves this HTML as a PDF file (Electron: native PDF; browser: download).',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    )
  } catch (error) {
    console.error('Error in export-progress-report-pdf:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ error: msg }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    )
  }
})
