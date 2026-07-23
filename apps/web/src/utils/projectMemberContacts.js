/**
 * Contacts linked to a project via project_contacts.
 * Uses String() coercion on project_id to avoid UUID/type mismatches.
 */
export function isContactOnProject(contact, projectId) {
  if (!contact || projectId == null) return false;
  const pid = String(projectId);
  return (
    Array.isArray(contact.project_contacts) &&
    contact.project_contacts.some((pc) => String(pc.project_id) === pid)
  );
}

export function getProjectMemberContacts(projectId, contacts = []) {
  if (projectId == null) return [];
  return (contacts || []).filter((c) => isContactOnProject(c, projectId));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Resolve auth user id for a contact (field issues assign by auth.users id).
 * Supports real contacts with profile_id and virtual `profile:<userId>` rows.
 */
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
 * Build field-issue assignee options from in-memory contacts (prefer project members).
 * @returns {{ userId: string, label: string }[]}
 */
export function buildIssueAssigneeOptionsFromContacts(
  contacts = [],
  { projectId = null, organizationId = null, fallbackLabel = 'Team member' } = {},
) {
  const members = getProjectMemberContacts(projectId, contacts);
  let pool = members;
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
    opts.push({
      userId,
      label: contact.name || contact.email || fallbackLabel,
    });
  }
  return opts;
}
