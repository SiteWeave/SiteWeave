import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildMinimalDigestEmail, formatDigestDueDate } from '../_shared/notificationEmailTemplates.ts'
import { sendTwilioSms } from '../_shared/twilioSms.ts'
import { normalizeAssigneePhone } from '../_shared/phone.ts'
import { createGuestShare } from '../_shared/guestShare.ts'
import { gateOrSendOptInForSubstantiveSms } from '../_shared/smsConsent.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM =
  Deno.env.get('RESEND_FROM') ?? 'SiteWeave Notifications <notifications@siteweave.org>'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function normalizeLeadDays(values: unknown, fallback = [14, 7]): number[] {
  if (!Array.isArray(values)) return fallback
  const parsed = values
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 365)
    .map((n) => Math.trunc(n))
  const unique = Array.from(new Set(parsed))
  return unique.length > 0 ? unique.sort((a, b) => b - a) : fallback
}

function isoDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function buildAppUrl(projectId?: string | null): string {
  const base = Deno.env.get('DESKTOP_APP_URL') || Deno.env.get('PUBLIC_APP_URL') || 'https://app.siteweave.org'
  return projectId ? `${base}/?project=${projectId}` : base
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayIso = isoDateOnly(today)

    const { data: tasks, error: taskError } = await supabase
      .from('tasks')
      .select(`
        id,
        text,
        start_date,
        due_date,
        priority,
        completed,
        assignee_id,
        project_id,
        organization_id,
        contacts(name, email, phone),
        projects(
          name,
          address,
          task_notifications_use_org_defaults,
          task_start_notifications_enabled,
          task_start_notification_lead_days,
          notification_email_batching_enabled
        )
      `)
      .eq('completed', false)
      .not('start_date', 'is', null)
      .not('assignee_id', 'is', null)

    if (taskError) {
      return new Response(
        JSON.stringify({ error: 'Failed to load tasks', details: taskError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const taskList = tasks || []
    if (taskList.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, sent: 0, skipped: 0, failed: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const organizationIds = Array.from(new Set(taskList.map((t: any) => t.organization_id).filter(Boolean)))
    const { data: orgRows } = await supabase
      .from('organizations')
      .select(
        'id, name, task_start_notifications_enabled, task_start_notification_lead_days, notification_email_batching_enabled, progress_report_timezone',
      )
      .in('id', organizationIds)

    const orgById = new Map((orgRows || []).map((row: any) => [row.id, row]))
    const taskIds = taskList.map((t: any) => t.id)
    const { data: existingRows } = await supabase
      .from('task_notification_history')
      .select('task_id, lead_days')
      .eq('notification_date', todayIso)
      .in('task_id', taskIds)
    const existingSet = new Set((existingRows || []).map((row: any) => `${row.task_id}:${row.lead_days}`))

    let sent = 0
    let skipped = 0
    let failed = 0
    let batched = 0

    const groupedNotifications = new Map<string, any>()

    for (const task of taskList) {
      const startDate = new Date(task.start_date)
      startDate.setHours(0, 0, 0, 0)
      const daysUntilStart = Math.floor((startDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))

      const orgConfig = orgById.get(task.organization_id) || {}
      const orgEnabled = orgConfig.task_start_notifications_enabled !== false
      const orgLeadDays = normalizeLeadDays(orgConfig.task_start_notification_lead_days, [14, 7])

      const project = task.projects || {}
      const useOrgDefaults = project.task_notifications_use_org_defaults !== false
      const enabled = useOrgDefaults
        ? orgEnabled
        : (project.task_start_notifications_enabled ?? orgEnabled)
      const leadDays = useOrgDefaults
        ? orgLeadDays
        : normalizeLeadDays(project.task_start_notification_lead_days, orgLeadDays)

      if (!enabled || !leadDays.includes(daysUntilStart)) {
        continue
      }

      const dedupeKey = `${task.id}:${daysUntilStart}`
      if (existingSet.has(dedupeKey)) {
        skipped += 1
        continue
      }

      const recipientEmail = task.contacts?.email ? String(task.contacts.email).trim().toLowerCase() : null
      const normalizedPhone = normalizeAssigneePhone(task.contacts?.phone || '')
      const recipientPhone = normalizedPhone.isValid ? normalizedPhone.e164 : null
      const recipientName = task.contacts?.name || 'teammate'
      if (!recipientEmail && !recipientPhone) {
        skipped += 1
        continue
      }
      const recipientAddress = recipientEmail || `sms:${recipientPhone}`

      const orgBatchEnabled = orgConfig.notification_email_batching_enabled !== false
      const projectBatchEnabled = task.projects?.notification_email_batching_enabled
      const batchEnabled = projectBatchEnabled == null ? orgBatchEnabled : projectBatchEnabled !== false
      const batchKey = batchEnabled
        ? `${task.organization_id}:${task.project_id}:${recipientAddress}:${daysUntilStart}`
        : `${task.organization_id}:${task.project_id}:${recipientAddress}:${task.id}:${daysUntilStart}`

      const bucket = groupedNotifications.get(batchKey) || {
        recipientEmail,
        recipientPhone,
        recipientAddress,
        recipientName,
        projectId: task.project_id,
        organizationId: task.organization_id,
        organizationName: (orgById.get(task.organization_id) as { name?: string })?.name || 'Your team',
        projectName: task.projects?.name || 'your project',
        daysUntilStart,
        tasks: [],
        batchEnabled,
      }
      bucket.tasks.push(task)
      groupedNotifications.set(batchKey, bucket)
    }

    for (const [, bucket] of groupedNotifications) {
      const batchSize = bucket.tasks.length
      const dueLabel = bucket.daysUntilStart === 0
        ? 'Today'
        : `In ${bucket.daysUntilStart} day${bucket.daysUntilStart === 1 ? '' : 's'}`
      const heading = batchSize > 1
        ? `${bucket.projectName}: tasks assigned to you`
        : `Task reminder for ${bucket.projectName}`
      const subheading = batchSize > 1
        ? `${batchSize} items need attention`
        : bucket.tasks[0]?.text || 'Task reminder'
      const summaryLabel = bucket.daysUntilStart === 0 ? 'Due now' : 'Due soon'
      const projectAddress = (bucket.tasks[0]?.projects as { address?: string } | undefined)?.address || null
      const calendarTimeZone =
        (orgById.get(bucket.organizationId) as { progress_report_timezone?: string } | undefined)
          ?.progress_report_timezone || null

      const taskIdList = bucket.tasks.map((t: any) => t.id)
      let guestUrl = buildAppUrl(bucket.projectId)
      const shareResult = await createGuestShare(supabase, {
        projectId: bucket.projectId,
        organizationId: bucket.organizationId,
        taskIds: taskIdList,
        source: 'task_start',
      })
      if ('url' in shareResult) {
        guestUrl = shareResult.url
      } else {
        console.error('createGuestShare failed:', shareResult.error)
      }

      const template = buildMinimalDigestEmail({
        heading,
        subheading,
        ctaUrl: guestUrl,
        reviewLinkText: batchSize > 1 ? 'Review your tasks in SiteWeave' : 'Review this task in SiteWeave',
        summaryLabel,
        summaryValue: batchSize,
        recipientName: bucket.recipientName,
        tasks: bucket.tasks.map((task: any) => ({
          title: task.text || 'Task',
          dueLabel,
          priority: task.priority || null,
          dueDateLabel: formatDigestDueDate(task.due_date),
          dueDateIso: task.due_date ? String(task.due_date).slice(0, 10) : null,
          startDateIso: task.start_date ? String(task.start_date).slice(0, 10) : null,
        })),
        projectName: bucket.projectName,
        projectAddress: projectAddress ? String(projectAddress).trim() : null,
        tasksSectionTitle: batchSize > 1 ? 'Your tasks' : 'Task details',
        calendarTimeZone,
      })
      const subject = batchSize > 1
        ? `${batchSize} updates for ${bucket.projectName}`
        : `Reminder: "${bucket.tasks[0]?.text || 'Task'}" starts ${dueLabel.toLowerCase()}`

      let status: 'sent' | 'failed' = 'sent'
      let errorMessage: string | null = null

      let emailDelivered = false
      let smsDelivered = false

      if (RESEND_API_KEY && bucket.recipientEmail) {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [bucket.recipientEmail],
            subject,
            html: template.html,
            text: template.text,
          }),
        })
        if (!resendResponse.ok) {
          status = 'failed'
          errorMessage = `Resend error (${resendResponse.status})`
        } else {
          emailDelivered = true
        }
      }

      if (bucket.recipientPhone) {
        const gate = await gateOrSendOptInForSubstantiveSms(supabase, {
          phoneE164: bucket.recipientPhone,
          organizationId: bucket.organizationId,
          organizationName: bucket.organizationName || 'Your team',
        })
        if (!gate.allowed) {
          if (gate.optInSent) {
            errorMessage = errorMessage
              ? `${errorMessage}; SMS: opt_in_sent`
              : 'SMS: opt_in_sent (awaiting YES)'
          } else {
            errorMessage = errorMessage
              ? `${errorMessage}; SMS: blocked (${gate.reason || 'consent'})`
              : `SMS: blocked (${gate.reason || 'consent'})`
          }
        } else {
          const smsBody = batchSize > 1
            ? `${batchSize} tasks for ${bucket.projectName} start ${dueLabel.toLowerCase()}. Open: ${guestUrl}`
            : `${bucket.tasks[0]?.text || 'Task'} in ${bucket.projectName} starts ${dueLabel.toLowerCase()}. Open: ${guestUrl}`
          const smsResult = await sendTwilioSms({
            to: bucket.recipientPhone,
            body: smsBody,
          })
          if (!smsResult.success) {
            status = status === 'failed' ? 'failed' : 'sent'
            errorMessage = errorMessage
              ? `${errorMessage}; SMS: ${smsResult.error || 'twilio_failed'}`
              : `SMS: ${smsResult.error || 'twilio_failed'}`
          } else {
            smsDelivered = true
          }
        }
      }

      if (!emailDelivered && !smsDelivered) {
        status = 'failed'
        if (!errorMessage) {
          errorMessage = 'No notification channel succeeded'
        }
      }

      const batchRef = bucket.batchEnabled ? crypto.randomUUID() : null
      const historyRows = bucket.tasks.map((task: any) => ({
        task_id: task.id,
        project_id: task.project_id,
        organization_id: task.organization_id,
        recipient_email: bucket.recipientAddress,
        lead_days: bucket.daysUntilStart,
        notification_date: todayIso,
        status,
        error_message: errorMessage,
        sent_at: new Date().toISOString(),
        batch_key: batchRef,
      }))
      const { error: historyError } = await supabase.from('task_notification_history').insert(historyRows)

      const notificationRows = bucket.tasks.map((task: any) => ({
        organization_id: task.organization_id,
        project_id: task.project_id,
        recipient_email: bucket.recipientAddress,
        recipient_user_id: task.assignee_id || null,
        source_type: 'task_start',
        source_id: task.id,
        title: batchSize > 1 ? `${batchSize} task reminders` : `Task starts ${dueLabel.toLowerCase()}`,
        body: `${task.text || 'Task'} in ${bucket.projectName}`,
        metadata: {
          batch_key: batchRef,
          lead_days: bucket.daysUntilStart,
          project_name: bucket.projectName,
          action_url: guestUrl,
          channels: {
            email: Boolean(bucket.recipientEmail),
            sms: Boolean(bucket.recipientPhone),
          },
        },
      }))
      const { error: notificationError } = await supabase
        .from('user_notifications')
        .upsert(notificationRows, { onConflict: 'source_type,source_id,recipient_email' })

      if (historyError || status === 'failed') {
        failed += batchSize
      } else {
        sent += batchSize
        if (bucket.batchEnabled && batchSize > 1) batched += 1
      }
      if (notificationError) {
        console.error('Failed to upsert task notifications:', notificationError.message)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: taskList.length,
        sent,
        skipped,
        failed,
        batched,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Unexpected error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
})

