import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { buildCalendarInviteEmail } from '../_shared/notificationEmailTemplates.ts'
import { sendTransactionalEmail } from '../_shared/transactionalEmailLayout.ts'
import { corsHeadersFor, corsPreflightResponse } from '../_shared/cors.ts'
import {
  assertOrgMember,
  createServiceClient,
  jsonResponse,
  requireUser,
} from '../_shared/auth.ts'
import { insertUserNotifications } from '../_shared/projectCommunicationNotify.ts'

function normalizeEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of raw) {
    const email = String(entry || '').trim().toLowerCase()
    if (!email.includes('@') || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

async function resolveRecipientUserId(
  supabase: SupabaseClient,
  organizationId: string,
  email: string,
): Promise<string | null> {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, contacts:contact_id(email)')
    .eq('organization_id', organizationId)

  for (const row of profiles || []) {
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts
    if (contact?.email?.toLowerCase() === email) {
      return row.id as string
    }
  }

  return null
}

function formatEventWhen(event: {
  start_time?: string | null
  is_all_day?: boolean | null
}): string {
  if (!event.start_time) return 'Scheduled'
  const date = new Date(event.start_time).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  if (event.is_all_day) return `${date} (all day)`
  const time = new Date(event.start_time).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${date} at ${time}`
}

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)

  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const authResult = await requireUser(req, corsHeaders)
    if (authResult instanceof Response) return authResult
    const { user } = authResult

    const body = await req.json()
    const eventId = body?.eventId as string
    const organizerName = String(body?.organizerName || user.email?.split('@')[0] || 'Team member')
    const newAttendeeEmails = normalizeEmails(body?.newAttendeeEmails)

    if (!eventId) {
      return jsonResponse({ error: 'eventId required' }, 400, corsHeaders)
    }
    if (!newAttendeeEmails.length) {
      return jsonResponse({ success: true, notified: 0 }, 200, corsHeaders)
    }

    const supabase = createServiceClient()
    const { data: event, error: eventError } = await supabase
      .from('calendar_events')
      .select('id, title, description, location, start_time, end_time, is_all_day, project_id, organization_id, user_id, created_by_user_id')
      .eq('id', eventId)
      .maybeSingle()

    if (eventError || !event) {
      return jsonResponse({ error: 'Event not found' }, 404, corsHeaders)
    }

    const orgAuth = await assertOrgMember(supabase, user.id, event.organization_id, corsHeaders)
    if (orgAuth instanceof Response) return orgAuth

    const organizerEmail = user.email?.toLowerCase() || ''
    const inviteEmails = newAttendeeEmails.filter((email) => email !== organizerEmail)

    if (!inviteEmails.length) {
      return jsonResponse({ success: true, notified: 0 }, 200, corsHeaders)
    }

    const whenLabel = formatEventWhen(event)
    const notifRows = []
    const emailPayload = buildCalendarInviteEmail(event, organizerName)

    for (const recipientEmail of inviteEmails) {
      const recipientUserId = await resolveRecipientUserId(
        supabase,
        event.organization_id,
        recipientEmail,
      )

      notifRows.push({
        organization_id: event.organization_id,
        project_id: event.project_id,
        recipient_user_id: recipientUserId,
        recipient_email: recipientEmail,
        source_type: 'calendar_invite',
        source_id: event.id,
        title: `Event invite: ${event.title || 'Event'}`,
        body: `${organizerName} invited you to "${event.title || 'Event'}" — ${whenLabel}`,
        metadata: {
          route: '/(tabs)/calendar',
          screen: '/(tabs)/calendar',
          event_id: event.id,
          start_time: event.start_time,
          project_id: event.project_id,
          source_type: 'calendar_invite',
        },
      })

      try {
        await sendTransactionalEmail({
          to: recipientEmail,
          subject: emailPayload.subject,
          html: emailPayload.html,
          text: emailPayload.text,
        })
      } catch (emailError) {
        console.error('calendar invite email failed', recipientEmail, emailError)
      }
    }

    await insertUserNotifications(supabase, notifRows)

    return jsonResponse({ success: true, notified: inviteEmails.length }, 200, corsHeaders)
  } catch (error) {
    console.error('notify-calendar-invite:', error)
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Internal error' },
      500,
      corsHeaders,
    )
  }
})
