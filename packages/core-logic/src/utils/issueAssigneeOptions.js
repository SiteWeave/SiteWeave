/**
 * Field-issue assignees are auth user ids (profiles.id).
 * Prefer people on the project; fall back to org profiles when needed.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function resolveContactAuthUserId(contact) {
  if (!contact) return null;
  if (isUuid(contact.profile_id)) return contact.profile_id;
  const id = String(contact.id || '');
  if (id.startsWith('profile:')) {
    const userId = id.slice('profile:'.length);
    return isUuid(userId) ? userId : null;
  }
  return null;
}

/**
 * Build assignee options from in-memory contacts (web AppContext shape).
 * @returns {{ userId: string, label: string, email?: string|null, phone?: string|null }[]}
 */
export function buildIssueAssigneeOptionsFromContacts(
  contacts = [],
  { projectId = null, organizationId = null, fallbackLabel = 'Team member' } = {},
) {
  const pid = projectId != null ? String(projectId) : null;
  let pool = (contacts || []).filter((contact) => {
    if (!pid) return false;
    return (
      Array.isArray(contact.project_contacts) &&
      contact.project_contacts.some((pc) => String(pc.project_id) === pid)
    );
  });

  if (pool.length === 0) {
    pool = (contacts || []).filter((contact) => {
      if (
        organizationId &&
        contact.organization_id &&
        String(contact.organization_id) !== String(organizationId)
      ) {
        return false;
      }
      const type = String(contact.type || '').toLowerCase();
      return !type || type === 'team' || type === 'internal' || type === 'user';
    });
  }

  const seen = new Set();
  const opts = [];
  for (const contact of pool) {
    const userId = resolveContactAuthUserId(contact);
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    const email = contact.email ? String(contact.email).trim() : null;
    const phone = contact.phone ? String(contact.phone).trim() : null;
    opts.push({
      userId,
      label: contact.name || contact.email || fallbackLabel,
      email: email && email.includes('@') ? email : null,
      phone: phone || null,
    });
  }
  return opts;
}

/**
 * Load assignee options for a project (mobile / server-friendly).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ projectId: string, organizationId?: string|null, fallbackLabel?: string }} args
 * @returns {Promise<{ userId: string, label: string, email?: string|null, phone?: string|null }[]>}
 */
export async function fetchIssueAssigneeOptions(supabase, args = {}) {
  const {
    projectId,
    organizationId = null,
    fallbackLabel = 'Team member',
  } = args;

  if (!supabase || !projectId) return [];

  const { data: rows, error: pcError } = await supabase
    .from('project_contacts')
    .select('contact_id, contacts!fk_project_contacts_contact_id(id, name, email, phone)')
    .eq('project_id', projectId);

  if (pcError) throw pcError;

  const contactIds = (rows || [])
    .map((row) => row.contact_id || row.contacts?.id)
    .filter((id) => isUuid(id));

  let profileQuery = supabase
    .from('profiles')
    .select('id, contact_id, contacts:contact_id(name, email, phone)');

  if (contactIds.length > 0) {
    profileQuery = profileQuery.in('contact_id', contactIds);
  } else if (organizationId) {
    profileQuery = profileQuery.eq('organization_id', organizationId);
  } else {
    return [];
  }

  const { data: profiles, error } = await profileQuery;
  if (error) throw error;

  const seen = new Set();
  const opts = [];
  for (const profile of profiles || []) {
    if (!isUuid(profile.id) || seen.has(profile.id)) continue;
    seen.add(profile.id);
    const email = profile.contacts?.email ? String(profile.contacts.email).trim() : null;
    const phone = profile.contacts?.phone ? String(profile.contacts.phone).trim() : null;
    opts.push({
      userId: profile.id,
      label: profile.contacts?.name || profile.contacts?.email || fallbackLabel,
      email: email && email.includes('@') ? email : null,
      phone: phone || null,
    });
  }
  return opts;
}
