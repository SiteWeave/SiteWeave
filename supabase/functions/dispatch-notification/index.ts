import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildMinimalDigestEmail } from '../_shared/notificationEmailTemplates.ts'
import { sendTwilioSms } from '../_shared/twilioSms.ts'
import { normalizeAssigneePhone } from '../_shared/phone.ts'
import { createGuestShare } from '../_shared/guestShare.ts'
import { gateOrSendOptInForSubstantiveSms, sendOptInIfEligible } from '../_shared/smsConsent.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM =
  Deno.env.get('RESEND_FROM') ?? 'SiteWeave Notifications <notifications@siteweave.org>'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function buildAppUrl(projectId?: string | null): string {
  const base = Deno.env.get('DESKTOP_APP_URL') || Deno.env.get('PUBLIC_APP_URL') || 'https://app.siteweave.org'
  return projectId ? `${base}/?project=${projectId}` : base
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json()
    const action = body?.action

    if (action === 'dependency_unlocked') {
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
      if (RESEND_API_KEY) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [recipientEmail],
            subject: `Task unlocked: ${successorTaskText || 'Task'}`,
            html: template.html,
            text: template.text,
          }),
        })
        if (!response.ok) {
          status = 'failed'
          errorMessage = `Resend error (${response.status})`
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
      const { notificationId, userId, actionType } = body
      if (!notificationId || !actionType) {
        return new Response(JSON.stringify({ error: 'Missing notificationId/actionType' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (actionType === 'mark_read') {
        patch.read_at = new Date().toISOString()
        patch.read_by_user_id = userId || null
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
        acted_by_user_id: userId || null,
      })

      return new Response(
        JSON.stringify({ success: true, log_error: logError?.message || null }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    if (action === 'manual_task_reminder') {
      const {
        taskId,
        taskText,
        recipientEmail,
        recipientPhone,
        recipientName,
        projectId,
        projectName,
        organizationId,
        senderName,
        deliveryChannels: deliveryChannelsRaw,
        taskPriority,
        taskDueDateLabel,
        projectAddress,
        organizationName: organizationNameRaw,
      } = body
      if (!taskId || !projectId || !organizationId) {
        return new Response(JSON.stringify({ error: 'Missing task/project/organization identifiers' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const normalizedEmail = recipientEmail ? String(recipientEmail).trim().toLowerCase() : null
      const normalizedPhone = normalizeAssigneePhone(recipientPhone || '')
      const smsPhone = normalizedPhone.isValid ? normalizedPhone.e164 : null
      const hasEmail = Boolean(normalizedEmail && normalizedEmail.includes('@'))
      const hasSms = Boolean(smsPhone)

      let channels: ('email' | 'sms')[]
      if (Array.isArray(deliveryChannelsRaw) && deliveryChannelsRaw.length > 0) {
        channels = [...new Set(
          deliveryChannelsRaw
            .map((c: unknown) => String(c || '').toLowerCase())
            .filter((c: string) => c === 'email' || c === 'sms'),
        )] as ('email' | 'sms')[]
        if (channels.length === 0) {
          return new Response(JSON.stringify({ error: 'deliveryChannels must include email and/or sms' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          })
        }
        if (channels.includes('email') && !hasEmail) {
          return new Response(JSON.stringify({ error: 'Email ping requested but no valid recipient email' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          })
        }
        if (channels.includes('sms') && !hasSms) {
          return new Response(JSON.stringify({ error: 'SMS ping requested but no valid recipient phone' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          })
        }
      } else if (hasEmail && hasSms) {
        channels = ['email']
      } else if (hasEmail) {
        channels = ['email']
      } else if (hasSms) {
        channels = ['sms']
      } else {
        channels = []
      }

      const recipientAddress = normalizedEmail || (smsPhone ? `sms:${smsPhone}` : null)
      const organizationName = String(organizationNameRaw || projectName || 'Your team').trim() || 'Your team'
      if (!recipientAddress || channels.length === 0) {
        return new Response(JSON.stringify({ error: 'No valid recipient email or phone for reminder' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      let emailDelivered = false
      let smsDelivered = false
      let smsSid: string | null = null
      let smsStatus: string | null = null
      let errorMessage: string | null = null

      let guestUrl = buildAppUrl(projectId)
      const shareManual = await createGuestShare(supabase, {
        projectId,
        organizationId,
        taskIds: [taskId],
        source: 'manual_reminder',
      })
      if ('url' in shareManual) {
        guestUrl = shareManual.url
      } else {
        console.error('createGuestShare (manual_reminder):', shareManual.error)
      }

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

      const template = buildMinimalDigestEmail({
        heading: `${projectName || 'Project'}: Task reminder`,
        subheading: taskText || 'Task',
        ctaUrl: guestUrl,
        reviewLinkText: 'Review this task in SiteWeave',
        summaryLabel: 'Reminder',
        summaryValue: 1,
        recipientName: recipientName || 'there',
        tasks: [
          {
            title: taskText || 'Task',
            priority: taskPriority ? String(taskPriority) : null,
            dueDateLabel: taskDueDateLabel ? String(taskDueDateLabel) : null,
            dueDateIso,
            startDateIso,
          },
        ],
        footerText: `${senderName || 'A teammate'} sent this reminder.`,
        projectName: projectName || null,
        projectAddress: projectAddress ? String(projectAddress).trim() : null,
        tasksSectionTitle: 'Task reminder',
        omitLeadBlock: true,
        calendarTimeZone: orgTzManual?.progress_report_timezone ?? null,
      })

      const sendEmail = channels.includes('email')
      const sendSms = channels.includes('sms')

      if (RESEND_API_KEY && normalizedEmail && sendEmail) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [normalizedEmail],
            subject: `Reminder: ${taskText || 'Task'}`,
            html: template.html,
            text: template.text,
          }),
        })
        if (!response.ok) {
          errorMessage = `Resend error (${response.status})`
        } else {
          emailDelivered = true
        }
      }

      if (smsPhone && sendSms) {
        const gate = await gateOrSendOptInForSubstantiveSms(supabase, {
          phoneE164: smsPhone,
          organizationId,
          organizationName,
        })
        if (!gate.allowed) {
          if (gate.optInSent) {
            errorMessage = errorMessage
              ? `${errorMessage}; SMS: consent message sent (reply YES)`
              : 'SMS: consent message sent — assignee must reply YES before reminders go out.'
          } else {
            errorMessage = errorMessage
              ? `${errorMessage}; SMS: blocked (${gate.reason || 'consent'})`
              : `SMS: blocked (${gate.reason || 'consent'})`
          }
        } else {
          const smsBody = `${senderName || 'A teammate'} sent a reminder: ${taskText || 'Task'} in ${projectName || 'your project'}. Open: ${guestUrl}`
          const smsResult = await sendTwilioSms({ to: smsPhone, body: smsBody })
          if (!smsResult.success) {
            errorMessage = errorMessage
              ? `${errorMessage}; SMS: ${smsResult.error || 'twilio_failed'}`
              : `SMS: ${smsResult.error || 'twilio_failed'}`
          } else {
            smsDelivered = true
            smsSid = smsResult.sid || null
            smsStatus = smsResult.status || null
          }
        }
      }

      const status: 'sent' | 'failed' = emailDelivered || smsDelivered ? 'sent' : 'failed'
      if (status === 'failed' && !errorMessage) {
        errorMessage = 'No notification channel succeeded'
      }

      const { data: insertedNotification, error: notificationError } = await supabase
        .from('user_notifications')
        .insert({
          organization_id: organizationId,
          project_id: projectId,
          recipient_email: recipientAddress,
          source_type: 'task_manual_reminder',
          source_id: crypto.randomUUID(),
          title: 'Manual reminder',
          body: `${taskText || 'Task'} in ${projectName || 'your project'}.`,
          metadata: {
            action_url: guestUrl,
            channels: { email: emailDelivered, sms: smsDelivered },
            task_id: taskId,
            sent_by: senderName || null,
          },
        })
        .select('id')
        .single()

      if (notificationError) {
        return new Response(JSON.stringify({ error: notificationError.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      if (insertedNotification?.id) {
        await supabase.from('notification_action_history').insert({
          notification_id: insertedNotification.id,
          action_type: status === 'sent' ? 'manual_send' : 'manual_send_failed',
          payload: {
            task_id: taskId,
            channels: { email: emailDelivered, sms: smsDelivered },
            error: errorMessage,
          },
        })
      }

      return new Response(
        JSON.stringify({
          success: status === 'sent',
          status,
          channels: { email: emailDelivered, sms: smsDelivered },
          sms: {
            attempted: sendSms && Boolean(smsPhone),
            to: smsPhone,
            sid: smsSid,
            status: smsStatus,
          },
          error: errorMessage,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    if (action === 'sms_opt_in_request') {
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

