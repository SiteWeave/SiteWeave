/**
 * Shared helpers for manual / scheduled project pings (issues + tasks).
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { buildMinimalDigestEmail } from './notificationEmailTemplates.ts'
import { sendTransactionalEmail } from './transactionalEmailLayout.ts'
import { sendSms } from './signalHouseSms.ts'
import { normalizeAssigneePhone } from './phone.ts'
import { createGuestShare } from './guestShare.ts'
import { gateOrSendOptInForSubstantiveSms } from './smsConsent.ts'
import { withTransactionalSmsFooter } from './smsCompliance.ts'
import { isSmsNotificationsEnabled } from './smsNotifications.ts'
import { buildAppProjectUrl, sendExpoPush } from './projectCommunicationNotify.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

export type PingChannel = 'email' | 'sms' | 'app'

export type PingRecipientInput = {
  userId?: string | null
  email?: string | null
  phone?: string | null
  name?: string | null
}

export type ResolvedPingRecipient = {
  userId: string | null
  email: string | null
  phone: string | null
  name: string
  pushToken: string | null
}

export type SendPingResult = {
  success: boolean
  channels: { email: boolean; sms: boolean; app: boolean }
  error: string | null
  sms?: { attempted: boolean; to: string | null; sid: string | null; status: string | null }
}

function buildFallbackAppUrl(projectId?: string | null): string {
  const base = Deno.env.get('DESKTOP_APP_URL') || Deno.env.get('PUBLIC_APP_URL') || 'https://app.siteweave.org'
  return projectId ? `${base}/?project=${projectId}` : base
}

export function normalizePingChannels(raw: unknown): PingChannel[] {
  const smsEnabled = isSmsNotificationsEnabled()
  let channels: PingChannel[] = []

  if (Array.isArray(raw) && raw.length > 0) {
    channels = [...new Set(
      raw
        .map((c) => String(c || '').toLowerCase())
        .filter((c): c is PingChannel => c === 'email' || c === 'sms' || c === 'app'),
    )]
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    if (obj.email) channels.push('email')
    if (obj.sms) channels.push('sms')
    if (obj.app) channels.push('app')
  }

  if (!smsEnabled) {
    channels = channels.filter((c) => c !== 'sms')
  }

  return channels
}

export function channelsToJson(channels: PingChannel[]): Record<string, boolean> {
  return {
    email: channels.includes('email'),
    sms: channels.includes('sms'),
    app: channels.includes('app'),
  }
}

/** Load profile contact email/phone + push token for auth user ids. */
export async function resolveRecipientsByUserIds(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<ResolvedPingRecipient[]> {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (!unique.length) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, push_token, contact_id, contacts:contact_id(name, email, phone)')
    .in('id', unique)

  const byId = new Map<string, ResolvedPingRecipient>()
  const needAuthEmail: string[] = []

  for (const row of profiles || []) {
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts
    const email = contact?.email ? String(contact.email).trim().toLowerCase() : null
    const rawPhone = contact?.phone ? String(contact.phone).trim() : ''
    const normalized = normalizeAssigneePhone(rawPhone)
    const phone = normalized.isValid ? normalized.e164 : null
    byId.set(row.id, {
      userId: row.id,
      email: email && email.includes('@') ? email : null,
      phone,
      name: contact?.name || 'there',
      pushToken: row.push_token || null,
    })
    if (!email || !email.includes('@')) needAuthEmail.push(row.id)
  }

  for (const id of unique) {
    if (!byId.has(id)) {
      byId.set(id, {
        userId: id,
        email: null,
        phone: null,
        name: 'there',
        pushToken: null,
      })
      needAuthEmail.push(id)
    }
  }

  await Promise.all(needAuthEmail.map(async (userId) => {
    const { data: { user: authUser }, error } = await supabase.auth.admin.getUserById(userId)
    if (!error && authUser?.email) {
      const existing = byId.get(userId)
      if (existing && !existing.email) {
        existing.email = authUser.email.toLowerCase()
        if (existing.name === 'there' && authUser.user_metadata?.full_name) {
          existing.name = String(authUser.user_metadata.full_name)
        }
      }
    }
  }))

  return unique.map((id) => byId.get(id)!).filter(Boolean)
}

export function mergeRecipientInputs(
  inputs: PingRecipientInput[],
  resolvedByUserId: Map<string, ResolvedPingRecipient>,
): ResolvedPingRecipient[] {
  const out: ResolvedPingRecipient[] = []
  const seen = new Set<string>()

  for (const input of inputs) {
    const userId = input.userId ? String(input.userId) : null
    const fromProfile = userId ? resolvedByUserId.get(userId) : null
    const emailRaw = input.email || fromProfile?.email || null
    const email = emailRaw ? String(emailRaw).trim().toLowerCase() : null
    const phoneRaw = input.phone || fromProfile?.phone || null
    const normalized = phoneRaw ? normalizeAssigneePhone(String(phoneRaw)) : null
    const phone = normalized?.isValid ? normalized.e164 : null
    const key = userId || email || phone || `${out.length}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      userId,
      email: email && email.includes('@') ? email : null,
      phone,
      name: String(input.name || fromProfile?.name || 'there'),
      pushToken: fromProfile?.pushToken || null,
    })
  }

  return out
}

type SendOneOpts = {
  supabase: SupabaseClient
  recipient: ResolvedPingRecipient
  channels: PingChannel[]
  organizationId: string
  organizationName: string
  projectId: string
  projectName: string
  projectAddress?: string | null
  senderName?: string | null
  entityType: 'issue' | 'task'
  entityId: string
  entityTitle: string
  priority?: string | null
  dueDateLabel?: string | null
  dueDateIso?: string | null
  startDateIso?: string | null
  calendarTimeZone?: string | null
  message?: string | null
  actionUrl?: string | null
  sourceType: string
}

async function sendOneRecipient(opts: SendOneOpts): Promise<SendPingResult> {
  const {
    supabase,
    recipient,
    channels,
    organizationId,
    organizationName,
    projectId,
    projectName,
    projectAddress,
    senderName,
    entityType,
    entityId,
    entityTitle,
    priority,
    dueDateLabel,
    dueDateIso,
    startDateIso,
    calendarTimeZone,
    message,
    sourceType,
  } = opts

  const wantEmail = channels.includes('email')
  const wantSms = channels.includes('sms')
  const wantApp = channels.includes('app')

  let emailDelivered = false
  let smsDelivered = false
  let appDelivered = false
  let smsSid: string | null = null
  let smsStatus: string | null = null
  let errorMessage: string | null = null

  let actionUrl = opts.actionUrl || buildAppProjectUrl(projectId, entityType === 'issue' ? 'updates' : 'tasks')
  if (entityType === 'task') {
    const share = await createGuestShare(supabase, {
      projectId,
      organizationId,
      taskIds: [entityId],
      source: 'manual_reminder',
    })
    if ('url' in share) {
      actionUrl = share.url
    } else {
      console.error('createGuestShare (ping):', share.error)
      if (!opts.actionUrl) actionUrl = buildFallbackAppUrl(projectId)
    }
  }

  const heading =
    entityType === 'issue'
      ? `${projectName || 'Project'}: Issue reminder`
      : `${projectName || 'Project'}: Task reminder`
  const note = message && String(message).trim() ? String(message).trim() : ''
  const template = buildMinimalDigestEmail({
    heading,
    subheading: entityTitle || (entityType === 'issue' ? 'Issue' : 'Task'),
    ctaUrl: actionUrl,
    reviewLinkText:
      entityType === 'issue'
        ? 'Review this issue in SiteWeave'
        : 'Review this task in SiteWeave',
    summaryLabel: 'Reminder',
    summaryValue: 1,
    recipientName: recipient.name || 'there',
    tasks: [
      {
        title: entityTitle || (entityType === 'issue' ? 'Issue' : 'Task'),
        priority: priority ? String(priority) : null,
        dueDateLabel: dueDateLabel ? String(dueDateLabel) : null,
        dueDateIso: dueDateIso || null,
        startDateIso: startDateIso || null,
      },
    ],
    footerText: `${senderName || 'A teammate'} sent this reminder.`,
    projectName: projectName || null,
    projectAddress: projectAddress ? String(projectAddress).trim() : null,
    tasksSectionTitle: entityType === 'issue' ? 'Issue reminder' : 'Task reminder',
    omitLeadBlock: true,
    calendarTimeZone: calendarTimeZone ?? null,
    note: note || null,
    noteLabel: senderName ? `Message from ${senderName}` : 'Message',
  })

  if (RESEND_API_KEY && recipient.email && wantEmail) {
    const sendResult = await sendTransactionalEmail({
      to: recipient.email,
      subject: `Reminder: ${entityTitle || (entityType === 'issue' ? 'Issue' : 'Task')}`,
      html: template.html,
      text: template.text,
      replyTo: null,
    })
    if (!sendResult.success) {
      errorMessage = sendResult.error || 'Resend error'
    } else {
      emailDelivered = true
    }
  }

  if (recipient.phone && wantSms) {
    const gate = await gateOrSendOptInForSubstantiveSms(supabase, {
      phoneE164: recipient.phone,
      organizationId,
      organizationName,
    })
    if (!gate.allowed) {
      if (gate.optInSent) {
        errorMessage = errorMessage
          ? `${errorMessage}; SMS: consent message sent (reply YES)`
          : 'SMS: consent message sent — recipient must reply YES before reminders go out.'
      } else {
        errorMessage = errorMessage
          ? `${errorMessage}; SMS: blocked (${gate.reason || 'consent'})`
          : `SMS: blocked (${gate.reason || 'consent'})`
      }
    } else {
      const smsBody = withTransactionalSmsFooter(
        note
          ? `${senderName || 'A teammate'} sent a reminder: ${entityTitle || 'item'} in ${projectName || 'your project'}. "${note}" Open: ${actionUrl}`
          : `${senderName || 'A teammate'} sent a reminder: ${entityTitle || 'item'} in ${projectName || 'your project'}. Open: ${actionUrl}`,
      )
      const smsResult = await sendSms({ to: recipient.phone, body: smsBody })
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

  if (wantApp && recipient.userId) {
    const tokens = recipient.pushToken ? [recipient.pushToken] : []
    if (!tokens.length) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', recipient.userId)
        .maybeSingle()
      if (profile?.push_token) tokens.push(profile.push_token)
    }
    if (tokens.length) {
      const push = await sendExpoPush(tokens, {
        title: heading,
        body: note
          ? `${entityTitle || 'Reminder'}: ${note}`
          : entityTitle || 'Reminder',
        data: {
          project_id: projectId,
          entity_type: entityType,
          entity_id: entityId,
          screen:
            entityType === 'issue'
              ? `/projects/${projectId}/updates`
              : `/projects/${projectId}/tasks`,
          source_type: sourceType,
        },
      })
      appDelivered = (push?.sent || 0) > 0
      if (!appDelivered) {
        errorMessage = errorMessage
          ? `${errorMessage}; App: push failed`
          : 'App: push failed'
      }
    } else {
      errorMessage = errorMessage
        ? `${errorMessage}; App: no push token`
        : 'App: no push token'
    }
  }

  const recipientAddress =
    recipient.email || (recipient.phone ? `sms:${recipient.phone}` : null) ||
    (recipient.userId ? `user:${recipient.userId}` : null)

  if (recipientAddress) {
    const { data: insertedNotification } = await supabase
      .from('user_notifications')
      .insert({
        organization_id: organizationId,
        project_id: projectId,
        recipient_email: recipientAddress,
        recipient_user_id: recipient.userId,
        source_type: sourceType,
        source_id: crypto.randomUUID(),
        title: entityType === 'issue' ? 'Issue reminder' : 'Manual reminder',
        body: `${entityTitle || 'Item'} in ${projectName || 'your project'}.`,
        metadata: {
          action_url: actionUrl,
          channels: { email: emailDelivered, sms: smsDelivered, app: appDelivered },
          [`${entityType}_id`]: entityId,
          sent_by: senderName || null,
        },
      })
      .select('id')
      .single()

    if (insertedNotification?.id) {
      const status = emailDelivered || smsDelivered || appDelivered ? 'sent' : 'failed'
      await supabase.from('notification_action_history').insert({
        notification_id: insertedNotification.id,
        action_type: status === 'sent' ? 'manual_send' : 'manual_send_failed',
        payload: {
          [`${entityType}_id`]: entityId,
          channels: { email: emailDelivered, sms: smsDelivered, app: appDelivered },
          error: errorMessage,
        },
      })
    }
  }

  const success = emailDelivered || smsDelivered || appDelivered
  return {
    success,
    channels: { email: emailDelivered, sms: smsDelivered, app: appDelivered },
    error: success ? errorMessage : (errorMessage || 'No notification channel succeeded'),
    sms: {
      attempted: wantSms && Boolean(recipient.phone),
      to: recipient.phone,
      sid: smsSid,
      status: smsStatus,
    },
  }
}

export type MultiPingOpts = {
  supabase: SupabaseClient
  recipients: ResolvedPingRecipient[]
  channels: PingChannel[]
  organizationId: string
  organizationName: string
  projectId: string
  projectName: string
  projectAddress?: string | null
  senderName?: string | null
  entityType: 'issue' | 'task'
  entityId: string
  entityTitle: string
  priority?: string | null
  dueDateLabel?: string | null
  dueDateIso?: string | null
  startDateIso?: string | null
  calendarTimeZone?: string | null
  message?: string | null
  actionUrl?: string | null
  sourceType: string
}

export async function sendProjectPings(opts: MultiPingOpts): Promise<{
  success: boolean
  sent: number
  failed: number
  results: SendPingResult[]
  channels: { email: boolean; sms: boolean; app: boolean }
  error: string | null
  sms?: SendPingResult['sms']
}> {
  const results: SendPingResult[] = []
  let sent = 0
  let failed = 0
  const aggregated = { email: false, sms: false, app: false }
  const errors: string[] = []
  let lastSms: SendPingResult['sms'] | undefined

  for (const recipient of opts.recipients) {
    const hasAnyChannel =
      (opts.channels.includes('email') && recipient.email) ||
      (opts.channels.includes('sms') && recipient.phone) ||
      (opts.channels.includes('app') && recipient.userId)

    if (!hasAnyChannel) {
      failed += 1
      results.push({
        success: false,
        channels: { email: false, sms: false, app: false },
        error: 'No valid channel for recipient',
      })
      continue
    }

    const result = await sendOneRecipient({ ...opts, recipient })
    results.push(result)
    if (result.success) {
      sent += 1
      if (result.channels.email) aggregated.email = true
      if (result.channels.sms) aggregated.sms = true
      if (result.channels.app) aggregated.app = true
    } else {
      failed += 1
    }
    if (result.error) errors.push(result.error)
    if (result.sms) lastSms = result.sms
  }

  return {
    success: sent > 0,
    sent,
    failed,
    results,
    channels: aggregated,
    error: sent > 0 ? (errors.length ? errors.join('; ') : null) : (errors[0] || 'No notification channel succeeded'),
    sms: lastSms,
  }
}
