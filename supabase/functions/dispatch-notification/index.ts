import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { buildMinimalDigestEmail } from '../_shared/notificationEmailTemplates.ts'
import { sendTransactionalEmail } from '../_shared/transactionalEmailLayout.ts'
import { normalizeAssigneePhone } from '../_shared/phone.ts'
import { createGuestShare } from '../_shared/guestShare.ts'
import { sendOptInIfEligible } from '../_shared/smsConsent.ts'
import { isSmsNotificationsEnabled } from '../_shared/smsNotifications.ts'
import { corsHeadersFor, corsPreflightResponse } from '../_shared/cors.ts'
import { assertHasFullTierAccess } from '../_shared/workspaceTier.ts'
import {
  assertCanManageProject,
  assertOrgMember,
  createServiceClient,
  requireUser,
} from '../_shared/auth.ts'
import {
  channelsToJson,
  mergeRecipientInputs,
  normalizePingChannels,
  resolveRecipientsByUserIds,
  sendProjectPings,
  type PingRecipientInput,
} from '../_shared/projectPing.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

function buildAppUrl(projectId?: string | null): string {
  const base = Deno.env.get('DESKTOP_APP_URL') || Deno.env.get('PUBLIC_APP_URL') || 'https://app.siteweave.org'
  return projectId ? `${base}/?project=${projectId}` : base
}

const DELAY_HOURS = new Set([0, 12, 24, 36, 48])

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)

  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const supabase = createServiceClient()
    const body = await req.json()
    const action = body?.action

    if (action === 'dependency_unlocked') {
      const authResult = await requireUser(req, corsHeaders)
      if (authResult instanceof Response) return authResult
      const { user } = authResult
      const {
        completedTaskId,
        completedTaskText,
        successorTaskId,
        successorTaskText,
        recipientEmail,
        recipientName,
        projectId,
        projectName,
        organizationId,
        actorName,
        projectAddress,
        successorPriority,
        successorDueDate,
      } = body

      if (!completedTaskId || !successorTaskId || !recipientEmail || !projectId || !organizationId) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields for dependency_unlocked' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }

      const depAuthz = await assertCanManageProject(supabase, user.id, projectId, corsHeaders)
      if (depAuthz instanceof Response) return depAuthz

      const { data: existing } = await supabase
        .from('task_dependency_notification_history')
        .select('id')
        .eq('trigger_task_id', completedTaskId)
        .eq('successor_task_id', successorTaskId)
        .eq('recipient_email', recipientEmail)
        .maybeSingle()
      if (existing) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: 'already_notified' }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }

      let guestUrl = buildAppUrl(projectId)
      const shareDep = await createGuestShare(supabase, {
        projectId,
        organizationId,
        taskIds: [successorTaskId],
        source: 'dependency_unlocked',
      })
      if ('url' in shareDep) {
        guestUrl = shareDep.url
      } else {
        console.error('createGuestShare (dependency_unlocked):', shareDep.error)
      }

      const { data: orgTzDep } = await supabase
        .from('organizations')
        .select('progress_report_timezone')
        .eq('id', organizationId)
        .maybeSingle()

      const template = buildMinimalDigestEmail({
        heading: `${projectName || 'Project'}: task unlocked`,
        subheading: `${successorTaskText || 'Task'} is ready to start`,
        ctaUrl: guestUrl,
        reviewLinkText: 'Review this task in SiteWeave',
        summaryLabel: 'Due soon',
        summaryValue: 1,
        recipientName: recipientName || 'there',
        tasks: [
          {
            title: successorTaskText || 'Task',
            dueLabel: 'Ready',
            priority: successorPriority || null,
            dueDateLabel: successorDueDate ? String(successorDueDate) : null,
            dueDateIso: (() => {
              const s = successorDueDate != null ? String(successorDueDate).trim() : ''
              return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
            })(),
          },
        ],
        footerText: `${completedTaskText || 'A predecessor task'} was completed by ${actorName || 'a teammate'}.`,
        projectName: projectName || null,
        projectAddress: projectAddress ? String(projectAddress).trim() : null,
        tasksSectionTitle: 'Task',
        calendarTimeZone: orgTzDep?.progress_report_timezone ?? null,
      })

      let status: 'sent' | 'failed' = 'sent'
      let errorMessage: string | null = null
      if (RESEND_API_KEY && recipientEmail) {
        const sendResult = await sendTransactionalEmail({
          to: recipientEmail,
          subject: `Task unlocked: ${successorTaskText || 'Task'}`,
          html: template.html,
          text: template.text,
        })
        if (!sendResult.success) {
          status = 'failed'
          errorMessage = sendResult.error || `Resend error`
        }
      }

      const { error: historyError } = await supabase.from('task_dependency_notification_history').insert({
        trigger_task_id: completedTaskId,
        successor_task_id: successorTaskId,
        project_id: projectId,
        organization_id: organizationId,
        recipient_email: recipientEmail,
        status,
        error_message: errorMessage,
      })

      const { error: notificationError } = await supabase
        .from('user_notifications')
        .upsert(
          {
            organization_id: organizationId,
            project_id: projectId,
            recipient_email: recipientEmail,
            source_type: 'dependency_unlocked',
            source_id: successorTaskId,
            title: 'Task unlocked',
            body: `${successorTaskText || 'Task'} is ready to start in ${projectName || 'your project'}.`,
            metadata: { action_url: guestUrl, predecessor_task_id: completedTaskId },
          },
          { onConflict: 'source_type,source_id,recipient_email' },
        )

      return new Response(
        JSON.stringify({
          success: !historyError && status !== 'failed',
          status,
          history_error: historyError?.message || null,
          notification_error: notificationError?.message || null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    if (action === 'notification_action') {
      const authResult = await requireUser(req, corsHeaders)
      if (authResult instanceof Response) return authResult
      const { user } = authResult

      const { notificationId, userId, actionType } = body
      if (!notificationId || !actionType) {
        return new Response(JSON.stringify({ error: 'Missing notificationId/actionType' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      if (userId && userId !== user.id) {
        return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders)
      }

      const { data: notifRow } = await supabase
        .from('user_notifications')
        .select('id, organization_id, recipient_email')
        .eq('id', notificationId)
        .maybeSingle()

      if (!notifRow) {
        return jsonResponse({ error: 'Notification not found' }, 404, corsHeaders)
      }

      const member = await assertOrgMember(supabase, user.id, notifRow.organization_id, corsHeaders)
      if (member instanceof Response) return member

      const callerEmail = user.email?.toLowerCase()
      const recipientEmail = String(notifRow.recipient_email || '').toLowerCase()
      if (callerEmail && recipientEmail && !recipientEmail.includes('@')) {
        // sms:... addresses — allow org members
      } else if (callerEmail && recipientEmail && callerEmail !== recipientEmail) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_super_admin')
          .eq('id', user.id)
          .maybeSingle()
        if (!profile?.is_super_admin) {
          return jsonResponse({ error: 'Not allowed to update this notification' }, 403, corsHeaders)
        }
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (actionType === 'mark_read') {
        patch.read_at = new Date().toISOString()
        patch.read_by_user_id = user.id
      }
      if (actionType === 'mark_unread') {
        patch.read_at = null
        patch.read_by_user_id = null
      }
      if (actionType === 'acknowledge') {
        patch.acknowledged_at = new Date().toISOString()
      }

      const { error: updateError } = await supabase
        .from('user_notifications')
        .update(patch)
        .eq('id', notificationId)
      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const { error: logError } = await supabase.from('notification_action_history').insert({
        notification_id: notificationId,
        action_type: actionType,
        acted_by_user_id: user.id,
      })

      return new Response(
        JSON.stringify({ success: true, log_error: logError?.message || null }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    if (action === 'manual_task_reminder') {
      const authResult = await requireUser(req, corsHeaders)
      if (authResult instanceof Response) return authResult
      const { user } = authResult

      const {
        taskId,
        taskText,
        recipientEmail,
        recipientPhone,
        recipientName,
        recipients: recipientsRaw,
        recipientUserIds: recipientUserIdsRaw,
        projectId,
        projectName,
        organizationId,
        senderName,
        deliveryChannels: deliveryChannelsRaw,
        taskPriority,
        taskDueDateLabel,
        projectAddress,
        organizationName: organizationNameRaw,
        message,
      } = body
      if (!taskId || !projectId || !organizationId) {
        return new Response(JSON.stringify({ error: 'Missing task/project/organization identifiers' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const reminderAuthz = await assertCanManageProject(supabase, user.id, projectId, corsHeaders)
      if (reminderAuthz instanceof Response) return reminderAuthz

      const tierCheck = await assertHasFullTierAccess(supabase, organizationId)
      if (!tierCheck.ok) {
        return new Response(JSON.stringify({ error: tierCheck.error }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const recipientInputs: PingRecipientInput[] = []
      if (Array.isArray(recipientsRaw) && recipientsRaw.length > 0) {
        for (const r of recipientsRaw) {
          recipientInputs.push({
            userId: r?.userId || r?.user_id || null,
            email: r?.email || null,
            phone: r?.phone || null,
            name: r?.name || null,
          })
        }
      } else if (Array.isArray(recipientUserIdsRaw) && recipientUserIdsRaw.length > 0) {
        for (const id of recipientUserIdsRaw) {
          if (id) recipientInputs.push({ userId: String(id) })
        }
      } else {
        recipientInputs.push({
          email: recipientEmail || null,
          phone: recipientPhone || null,
          name: recipientName || null,
        })
      }

      if (!recipientInputs.length) {
        return new Response(JSON.stringify({ error: 'No recipients provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const userIds = recipientInputs.map((r) => r.userId).filter(Boolean) as string[]
      const resolved = await resolveRecipientsByUserIds(supabase, userIds)
      const byUserId = new Map(resolved.map((r) => [r.userId!, r]))
      const recipients = mergeRecipientInputs(recipientInputs, byUserId)

      let channels = normalizePingChannels(deliveryChannelsRaw)
      if (channels.length === 0) {
        const first = recipients[0]
        if (first?.email) channels = ['email']
        else if (first?.phone && isSmsNotificationsEnabled()) channels = ['sms']
      }
      channels = channels.filter((c) => c === 'email' || c === 'sms' || c === 'app')

      if (channels.length === 0) {
        return new Response(JSON.stringify({ error: 'No valid delivery channels' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const organizationName = String(organizationNameRaw || projectName || 'Your team').trim() || 'Your team'

      const { data: taskDatesRow } = await supabase
        .from('tasks')
        .select('due_date, start_date')
        .eq('id', taskId)
        .maybeSingle()
      const rawDue = taskDatesRow?.due_date
      const rawStart = taskDatesRow?.start_date
      const dueDateIso =
        typeof rawDue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDue)
          ? rawDue.slice(0, 10)
          : null
      const startDateIso =
        typeof rawStart === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawStart)
          ? rawStart.slice(0, 10)
          : null

      const { data: orgTzManual } = await supabase
        .from('organizations')
        .select('progress_report_timezone')
        .eq('id', organizationId)
        .maybeSingle()

      const result = await sendProjectPings({
        supabase,
        recipients,
        channels,
        organizationId,
        organizationName,
        projectId,
        projectName: projectName || 'Project',
        projectAddress: projectAddress || null,
        senderName: senderName || null,
        entityType: 'task',
        entityId: String(taskId),
        entityTitle: taskText || 'Task',
        priority: taskPriority || null,
        dueDateLabel: taskDueDateLabel || null,
        dueDateIso,
        startDateIso,
        calendarTimeZone: orgTzManual?.progress_report_timezone ?? null,
        message: message || null,
        sourceType: 'task_manual_reminder',
      })

      return new Response(
        JSON.stringify({
          success: result.success,
          status: result.success ? 'sent' : 'failed',
          sent: result.sent,
          failed: result.failed,
          channels: result.channels,
          sms: result.sms || null,
          error: result.error,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // Immediate or scheduled issue/task ping (multi-recipient, channels, delay).
    if (action === 'manual_issue_reminder' || action === 'project_ping') {
      const authResult = await requireUser(req, corsHeaders)
      if (authResult instanceof Response) return authResult
      const { user } = authResult

      const entityTypeRaw = String(body.entityType || (action === 'manual_issue_reminder' ? 'issue' : body.entityType || 'issue'))
      const entityType = entityTypeRaw === 'task' ? 'task' : 'issue'
      const entityId = String(body.entityId || body.issueId || body.taskId || '')
      const {
        projectId,
        projectName,
        organizationId,
        senderName,
        deliveryChannels: deliveryChannelsRaw,
        channels: channelsObj,
        recipientUserIds: recipientUserIdsRaw,
        recipients: recipientsRaw,
        projectAddress,
        organizationName: organizationNameRaw,
        message,
        delayHours: delayHoursRaw,
        entityTitle,
        priority,
        dueDateLabel,
      } = body

      if (!entityId || !projectId || !organizationId) {
        return new Response(JSON.stringify({ error: 'Missing entity/project/organization identifiers' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const pingAuthz = await assertCanManageProject(supabase, user.id, projectId, corsHeaders)
      if (pingAuthz instanceof Response) return pingAuthz

      const tierCheck = await assertHasFullTierAccess(supabase, organizationId)
      if (!tierCheck.ok) {
        return new Response(JSON.stringify({ error: tierCheck.error }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const delayHours = Number(delayHoursRaw ?? 0)
      if (!DELAY_HOURS.has(delayHours)) {
        return new Response(JSON.stringify({ error: 'delayHours must be 0, 12, 24, 36, or 48' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const recipientInputs: PingRecipientInput[] = []
      if (Array.isArray(recipientsRaw) && recipientsRaw.length > 0) {
        for (const r of recipientsRaw) {
          recipientInputs.push({
            userId: r?.userId || r?.user_id || null,
            email: r?.email || null,
            phone: r?.phone || null,
            name: r?.name || null,
          })
        }
      }
      if (Array.isArray(recipientUserIdsRaw)) {
        for (const id of recipientUserIdsRaw) {
          if (id && !recipientInputs.some((r) => String(r.userId) === String(id))) {
            recipientInputs.push({ userId: String(id) })
          }
        }
      }

      if (!recipientInputs.length) {
        return new Response(JSON.stringify({ error: 'Select at least one recipient' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      let channels = normalizePingChannels(deliveryChannelsRaw ?? channelsObj)
      if (channels.length === 0) channels = ['email', 'app']

      const recipientUserIds = [
        ...new Set(recipientInputs.map((r) => r.userId).filter(Boolean).map(String)),
      ]
      const organizationName = String(organizationNameRaw || projectName || 'Your team').trim() || 'Your team'

      if (delayHours > 0) {
        const sendAt = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString()
        const { data: row, error: insertError } = await supabase
          .from('scheduled_project_pings')
          .insert({
            organization_id: organizationId,
            project_id: projectId,
            entity_type: entityType,
            entity_id: entityId,
            recipient_user_ids: recipientUserIds,
            recipients: recipientInputs,
            channels: channelsToJson(channels),
            send_at: sendAt,
            status: 'pending',
            created_by: user.id,
            message: message ? String(message).slice(0, 500) : null,
          })
          .select('id, send_at')
          .single()

        if (insertError) {
          return new Response(JSON.stringify({ error: insertError.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          })
        }

        return new Response(
          JSON.stringify({
            success: true,
            scheduled: true,
            id: row.id,
            send_at: row.send_at,
            delayHours,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }

      // Immediate send
      let title = entityTitle ? String(entityTitle) : ''
      let entityPriority = priority ? String(priority) : null
      let entityDueLabel = dueDateLabel ? String(dueDateLabel) : null
      let dueDateIso: string | null = null
      let startDateIso: string | null = null

      if (entityType === 'issue') {
        const { data: issue } = await supabase
          .from('project_issues')
          .select('id, title, priority, due_date')
          .eq('id', entityId)
          .maybeSingle()
        if (!issue) {
          return new Response(JSON.stringify({ error: 'Issue not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          })
        }
        title = title || issue.title || 'Issue'
        entityPriority = entityPriority || issue.priority || null
        if (issue.due_date) {
          dueDateIso = String(issue.due_date).slice(0, 10)
          entityDueLabel = entityDueLabel || dueDateIso
        }
      } else {
        const { data: task } = await supabase
          .from('tasks')
          .select('id, text, priority, due_date, start_date')
          .eq('id', entityId)
          .maybeSingle()
        if (!task) {
          return new Response(JSON.stringify({ error: 'Task not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          })
        }
        title = title || task.text || 'Task'
        entityPriority = entityPriority || task.priority || null
        if (task.due_date) {
          dueDateIso = String(task.due_date).slice(0, 10)
          entityDueLabel = entityDueLabel || dueDateIso
        }
        if (task.start_date) startDateIso = String(task.start_date).slice(0, 10)
      }

      const resolved = await resolveRecipientsByUserIds(supabase, recipientUserIds)
      const byUserId = new Map(resolved.map((r) => [r.userId!, r]))
      const recipients = mergeRecipientInputs(recipientInputs, byUserId)

      const { data: orgTz } = await supabase
        .from('organizations')
        .select('progress_report_timezone')
        .eq('id', organizationId)
        .maybeSingle()

      const result = await sendProjectPings({
        supabase,
        recipients,
        channels,
        organizationId,
        organizationName,
        projectId,
        projectName: projectName || 'Project',
        projectAddress: projectAddress || null,
        senderName: senderName || null,
        entityType,
        entityId,
        entityTitle: title,
        priority: entityPriority,
        dueDateLabel: entityDueLabel,
        dueDateIso,
        startDateIso,
        calendarTimeZone: orgTz?.progress_report_timezone ?? null,
        message: message || null,
        sourceType: entityType === 'issue' ? 'issue_manual_reminder' : 'task_manual_reminder',
      })

      return new Response(
        JSON.stringify({
          success: result.success,
          scheduled: false,
          status: result.success ? 'sent' : 'failed',
          sent: result.sent,
          failed: result.failed,
          channels: result.channels,
          sms: result.sms || null,
          error: result.error,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    if (action === 'sms_opt_in_request') {
      if (!isSmsNotificationsEnabled()) {
        return new Response(
          JSON.stringify({ success: false, disabled: true, reason: 'sms_notifications_disabled' }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }

      const authResult = await requireUser(req, corsHeaders)
      if (authResult instanceof Response) return authResult
      const { user } = authResult

      const {
        recipientPhone,
        organizationId,
        organizationName: orgNameRaw,
        forceResend,
      } = body
      if (!recipientPhone || !organizationId) {
        return new Response(JSON.stringify({ error: 'Missing recipientPhone or organizationId' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const smsMember = await assertOrgMember(supabase, user.id, organizationId, corsHeaders)
      if (smsMember instanceof Response) return smsMember

      const normalizedPhone = normalizeAssigneePhone(String(recipientPhone || ''))
      const smsPhone = normalizedPhone.isValid ? normalizedPhone.e164 : null
      if (!smsPhone) {
        return new Response(JSON.stringify({ error: 'Invalid phone number' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }
      const organizationName = String(orgNameRaw || 'Your team').trim() || 'Your team'
      const res = await sendOptInIfEligible(supabase, {
        phoneE164: smsPhone,
        organizationId,
        organizationName,
        forceResend: Boolean(forceResend),
      })
      return new Response(
        JSON.stringify({
          success: res.sent,
          sent: res.sent,
          reason: res.reason || null,
          sid: res.sid || null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    return new Response(JSON.stringify({ error: 'Unsupported action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Unexpected error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})

