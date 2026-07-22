// Supabase Edge Function: Process Scheduled Reports
// Cron job to process all active schedules that are due

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createServiceClient, requireCronOrServiceRole } from '../_shared/auth.ts'
import { hasFullTierAccess } from '../_shared/workspaceTier.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type InvokeResult = {
  ok: boolean
  data: Record<string, unknown> | null
  error: string | null
}

/**
 * Edge-to-edge calls via supabase.functions.invoke() have been dropping/mangling
 * Authorization in this project (child fns return 401). Use explicit fetch with
 * service-role Bearer + apikey, matching generateProgressReportClient.
 */
async function invokeEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
): Promise<InvokeResult> {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')
  const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, data: null, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  let data: Record<string, unknown> | null = null
  try {
    data = await response.json() as Record<string, unknown>
  } catch {
    data = null
  }

  if (!response.ok) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : `Edge Function returned a non-2xx status code (${response.status})`
    return { ok: false, data, error: message }
  }

  return { ok: true, data, error: null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const cronDenied = requireCronOrServiceRole(req, corsHeaders)
  if (cronDenied) return cronDenied

  try {
    const supabase = createServiceClient()

    // Query all active schedules that are due
    const now = new Date().toISOString()
    
    const { data: dueSchedules, error: queryError } = await supabase
      .from('progress_report_schedules')
      .select('id, organization_id')
      .eq('is_active', true)
      .lte('next_send_at', now)
      .or('requires_approval.is.null,requires_approval.eq.false,approval_status.eq.approved')

    if (queryError) {
      console.error('Error querying schedules:', queryError)
      return new Response(
        JSON.stringify({ error: 'Failed to query schedules' }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          } 
        }
      )
    }

    if (!dueSchedules || dueSchedules.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No schedules due for processing',
          processed: 0
        }),
        { 
          status: 200, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          } 
        }
      )
    }

    const scheduleOrgIds = [...new Set(dueSchedules.map((s) => s.organization_id).filter(Boolean))]
    const { data: scheduleOrgs } = await supabase
      .from('organizations')
      .select('id, workspace_type, trial_ends_at')
      .in('id', scheduleOrgIds)
    const allowedScheduleOrgIds = new Set(
      (scheduleOrgs || []).filter((o) => hasFullTierAccess(o)).map((o) => o.id),
    )
    const tierEligibleSchedules = dueSchedules.filter((s) => allowedScheduleOrgIds.has(s.organization_id))

    const settledResults = await Promise.allSettled(
      tierEligibleSchedules.map((schedule) =>
        invokeEdgeFunction('send-progress-report', {
          schedule_id: schedule.id,
          is_manual: false,
        })
      ),
    )

    const results = []
    const errors = []

    for (const [i, result] of settledResults.entries()) {
      const schedule = tierEligibleSchedules[i]
      if (result.status === 'fulfilled' && result.value.ok) {
        results.push({
          schedule_id: schedule.id,
          success: true,
          ...(result.value.data || {}),
        })
      } else {
        const message =
          result.status === 'rejected'
            ? result.reason?.message || 'Unknown error'
            : result.value.error || 'Unknown error'
        errors.push({
          schedule_id: schedule.id,
          error: message,
        })
      }
    }

    // Process task-start smart notifications once per run.
    let notificationResult: Record<string, unknown> | null = null
    try {
      const notificationInvoke = await invokeEdgeFunction('process-task-notifications', {})
      notificationResult = notificationInvoke.ok
        ? { success: true, ...(notificationInvoke.data || {}) }
        : {
            success: false,
            error: notificationInvoke.error || 'Failed to process task notifications',
          }
    } catch (error) {
      notificationResult = { success: false, error: error.message || 'Failed to process task notifications' }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        processed: results.length,
        errors: errors.length,
        results: results,
        error_details: errors,
        task_notifications: notificationResult,
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
    console.error('Error in process-scheduled-reports:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
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
