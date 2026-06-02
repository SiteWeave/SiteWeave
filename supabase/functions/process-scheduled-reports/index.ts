// Supabase Edge Function: Process Scheduled Reports
// Cron job to process all active schedules that are due

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createServiceClient } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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

    const settledResults = await Promise.allSettled(
      dueSchedules.map((schedule) =>
        supabase.functions.invoke('send-progress-report', {
          body: { schedule_id: schedule.id, is_manual: false },
        })
      ),
    )

    const results = []
    const errors = []

    for (const [i, result] of settledResults.entries()) {
      const schedule = dueSchedules[i]
      if (result.status === 'fulfilled' && !result.value.error) {
        results.push({
          schedule_id: schedule.id,
          success: true,
          ...(result.value.data || {}),
        })
      } else {
        const message =
          result.status === 'rejected'
            ? result.reason?.message || 'Unknown error'
            : result.value.error?.message || 'Unknown error'
        errors.push({
          schedule_id: schedule.id,
          error: message,
        })
      }
    }

    // Process task-start smart notifications once per run.
    let notificationResult: Record<string, unknown> | null = null
    try {
      const { data: notificationData, error: notificationError } = await supabase.functions.invoke(
        'process-task-notifications',
        { body: {} },
      )
      notificationResult = notificationError
        ? { success: false, error: notificationError.message || 'Failed to process task notifications' }
        : { success: true, ...(notificationData || {}) }
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
