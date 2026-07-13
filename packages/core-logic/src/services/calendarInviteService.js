import { fetchProjectContacts } from './contactsService.js';

/**
 * Parse comma-separated or array attendee emails into normalized unique list.
 * @param {string|string[]|null|undefined} attendees
 * @returns {string[]}
 */
export function parseAttendeeEmails(attendees) {
  if (!attendees) return [];
  const raw = Array.isArray(attendees) ? attendees : String(attendees).split(/[\s,;]+/);
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const email = String(entry || '').trim().toLowerCase();
    if (!email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/**
 * Emails newly added compared to a previous attendees string.
 * @param {string|string[]|null|undefined} previousAttendees
 * @param {string|string[]|null|undefined} nextAttendees
 * @returns {string[]}
 */
export function diffNewAttendeeEmails(previousAttendees, nextAttendees) {
  const previous = new Set(parseAttendeeEmails(previousAttendees));
  return parseAttendeeEmails(nextAttendees).filter((email) => !previous.has(email));
}

/**
 * Serialize attendee emails for calendar_events.attendees column.
 * @param {string[]|null|undefined} emails
 * @returns {string}
 */
export function formatAttendeeEmails(emails) {
  return parseAttendeeEmails(emails).join(', ');
}

/**
 * Contacts available for event invites: project team or org-wide.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ organizationId?: string|null, projectId?: string|null }} params
 * @returns {Promise<Array<{ id: string, name?: string, email: string }>>}
 */
export async function fetchEventInviteContacts(supabase, { organizationId, projectId } = {}) {
  if (!supabase) return [];

  let contacts = [];
  if (projectId) {
    contacts = await fetchProjectContacts(supabase, projectId);
  } else if (organizationId) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, name, email, type')
      .eq('organization_id', organizationId)
      .not('email', 'is', null)
      .order('name', { ascending: true });
    if (error) throw error;
    contacts = data || [];
  }

  return (contacts || [])
    .filter((contact) => contact?.email && String(contact.email).includes('@'))
    .map((contact) => ({
      id: contact.id,
      name: contact.name,
      email: String(contact.email).trim().toLowerCase(),
      type: contact.type,
    }));
}

/**
 * Resolve a display name for the event organizer.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ userId?: string|null, userEmail?: string|null, fallback?: string }} params
 */
export async function resolveOrganizerDisplayName(supabase, { userId, userEmail, fallback = 'Team member' } = {}) {
  if (!supabase || !userId) {
    return userEmail?.split('@')[0] || fallback;
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('contact_id, contacts:contact_id(name)')
      .eq('id', userId)
      .maybeSingle();

    const contact = Array.isArray(profile?.contacts) ? profile.contacts[0] : profile?.contacts;
    if (contact?.name) return contact.name;
  } catch {
    // fall through
  }

  return userEmail?.split('@')[0] || fallback;
}

/**
 * Notify newly invited attendees via edge function (in-app inbox + email).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ eventId: string, newAttendeeEmails?: string[], organizerName?: string }} params
 */
export async function notifyCalendarInvitees(supabase, { eventId, newAttendeeEmails = [], organizerName }) {
  const emails = parseAttendeeEmails(newAttendeeEmails);
  if (!supabase || !eventId || emails.length === 0) {
    return { success: true, notified: 0 };
  }

  const { data, error } = await supabase.functions.invoke('notify-calendar-invite', {
    body: {
      eventId,
      newAttendeeEmails: emails,
      organizerName: organizerName || undefined,
    },
  });

  if (error) throw error;
  return data || { success: true, notified: emails.length };
}
