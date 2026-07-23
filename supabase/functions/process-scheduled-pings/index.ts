// Cron: process due scheduled_project_pings (~every 15 min).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createServiceClient, requireCronOrServiceRole } from '../_shared/auth.ts'
import { hasFullTierAccess } from '../_shared/workspaceTier.ts'
import {
  mergeRecipientInputs,
  normalizePingChannels,
  resolveRecipientsByUserIds,
  sendProjectPings,
  type PingRecipientInput,
} from '../_shared/projectPing.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BATCH_LIMIT = 50

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
    const now = new Date().toISOString()

    const { data: duePings, error: queryError } = await supabase
      .from('scheduled_project_pings')
      .select('*')
      .eq('status', 'pending')
      .lte('send_at', now)
      .order('send_at', { ascending: true })
      .limit(BATCH_LIMIT)

    if (queryError) {
      console.error('Error querying scheduled pings:', queryError)
      return new Response(JSON.stringify({ error: 'Failed to query scheduled pings' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    if (!duePings?.length) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pings due', processed: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const orgIds = [...new Set(duePings.map((p) => p.organization_id).filter(Boolean))]
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, workspace_type, trial_ends_at, name, progress_report_timezone')
      .in('id', orgIds)
    const orgById = new Map((orgs || []).map((o) => [o.id, o]))
    const allowedOrgIds = new Set(
      (orgs || []).filter((o) => hasFullTierAccess(o)).map((o) => o.id),
    )

    const results: Array<Record<string, unknown>> = []
    const errors: Array<Record<string, unknown>> = []

    for (const ping of duePings) {
      if (!allowedOrgIds.has(ping.organization_id)) {
        await supabase
          .from('scheduled_project_pings')
          .update({ status: 'cancelled', error: 'Workspace tier does not allow pings' })
          .eq('id', ping.id)
          .eq('status', 'pending')
        errors.push({ id: ping.id, error: 'tier_locked' })
        continue
      }

      // Claim the row so concurrent cron runs don't double-send.
      const { data: claimed, error: claimError } = await supabase
        .from('scheduled_project_pings')
        .update({ status: 'processing', error: null })
        .eq('id', ping.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()

      if (claimError || !claimed) {
        continue
      }

      try {
        const { data: project } = await supabase
          .from('projects')
          .select('id, name, address')
          .eq('id', ping.project_id)
          .maybeSingle()

        let entityTitle = 'Reminder'
        let priority: string | null = null
        let dueDateIso: string | null = null
        let startDateIso: string | null = null
        const entityType = ping.entity_type === 'task' ? 'task' : 'issue'

        if (entityType === 'issue') {
          const { data: issue } = await supabase
            .from('project_issues')
            .select('title, priority, due_date')
            .eq('id', ping.entity_id)
            .maybeSingle()
          entityTitle = issue?.title || 'Issue'
          priority = issue?.priority || null
          if (issue?.due_date) dueDateIso = String(issue.due_date).slice(0, 10)
        } else {
          const { data: task } = await supabase
            .from('tasks')
            .select('text, priority, due_date, start_date')
            .eq('id', ping.entity_id)
            .maybeSingle()
          entityTitle = task?.text || 'Task'
          priority = task?.priority || null
          if (task?.due_date) dueDateIso = String(task.due_date).slice(0, 10)
          if (task?.start_date) startDateIso = String(task.start_date).slice(0, 10)
        }

        const channels = normalizePingChannels(ping.channels)
        const recipientInputs: PingRecipientInput[] = []
        if (Array.isArray(ping.recipients) && ping.recipients.length > 0) {
          for (const r of ping.recipients) {
            recipientInputs.push({
              userId: r?.userId || r?.user_id || null,
              email: r?.email || null,
              phone: r?.phone || null,
              name: r?.name || null,
            })
          }
        }
        for (const id of ping.recipient_user_ids || []) {
          if (id && !recipientInputs.some((r) => String(r.userId) === String(id))) {
            recipientInputs.push({ userId: String(id) })
          }
        }

        const userIds = recipientInputs.map((r) => r.userId).filter(Boolean) as string[]
        const resolved = await resolveRecipientsByUserIds(supabase, userIds)
        const byUserId = new Map(resolved.map((r) => [r.userId!, r]))
        const recipients = mergeRecipientInputs(recipientInputs, byUserId)

        if (!recipients.length || channels.length === 0) {
          await supabase
            .from('scheduled_project_pings')
            .update({ status: 'failed', error: 'No recipients or channels' })
            .eq('id', ping.id)
          errors.push({ id: ping.id, error: 'No recipients or channels' })
          continue
        }

        const org = orgById.get(ping.organization_id)
        const sendResult = await sendProjectPings({
          supabase,
          recipients,
          channels: channels.length ? channels : ['email', 'app'],
          organizationId: ping.organization_id,
          organizationName: org?.name || project?.name || 'Your team',
          projectId: ping.project_id,
          projectName: project?.name || 'Project',
          projectAddress: project?.address || null,
          senderName: null,
          entityType,
          entityId: String(ping.entity_id),
          entityTitle,
          priority,
          dueDateLabel: dueDateIso,
          dueDateIso,
          startDateIso,
          calendarTimeZone: org?.progress_report_timezone ?? null,
          message: ping.message || null,
          sourceType: entityType === 'issue' ? 'issue_scheduled_reminder' : 'task_scheduled_reminder',
        })

        if (!sendResult.success) {
          await supabase
            .from('scheduled_project_pings')
            .update({ status: 'failed', error: sendResult.error || 'Send failed' })
            .eq('id', ping.id)
          errors.push({ id: ping.id, error: sendResult.error })
        } else {
          await supabase
            .from('scheduled_project_pings')
            .update({
              status: 'sent',
              error: sendResult.error || null,
            })
            .eq('id', ping.id)
          results.push({
            id: ping.id,
            success: true,
            sent: sendResult.sent,
            channels: sendResult.channels,
          })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        await supabase
          .from('scheduled_project_pings')
          .update({ status: 'failed', error: message })
          .eq('id', ping.id)
        errors.push({ id: ping.id, error: message })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        errors: errors.length,
        results,
        error_details: errors,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  } catch (error) {
    console.error('Error in process-scheduled-pings:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
})
