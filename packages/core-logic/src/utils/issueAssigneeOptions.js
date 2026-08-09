/**
 * Field-issue assignees are project contacts (anyone on the project).
 * When a contact has a linked profile, userId is included for app notifications.
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

function isContactOnProject(contact, projectId) {
  if (!contact || projectId == null) return false;
  const pid = String(projectId);
  return (
    Array.isArray(contact.project_contacts) &&
    contact.project_contacts.some((pc) => String(pc.project_id) === pid)
  );
}

function optionFromProjectContact(contact, fallbackLabel) {
  const rawId = contact?.id != null ? String(contact.id) : '';
  // Virtual profile-only rows use id `profile:<userId>` — treat userId as both keys.
  if (rawId.startsWith('profile:')) {
    const userId = rawId.slice('profile:'.length);
    if (!isUuid(userId)) return null;
    return {
      contactId: userId,
      userId,
      label: contact.name || contact.email || fallbackLabel,
      email: null,
      phone: null,
      isVirtualProfile: true,
    };
  }
  if (!isUuid(rawId)) return null;
  const email = contact.email ? String(contact.email).trim() : null;
  const phone = contact.phone ? String(contact.phone).trim() : null;
  return {
    contactId: rawId,
    userId: resolveContactAuthUserId(contact),
    label: contact.name || contact.email || fallbackLabel,
    email: email && email.includes('@') ? email : null,
    phone: phone || null,
    isVirtualProfile: false,
  };
}

function dedupeByContactId(options) {
  const seen = new Set();
  const opts = [];
  for (const opt of options) {
    if (!opt?.contactId || seen.has(opt.contactId)) continue;
    seen.add(opt.contactId);
    opts.push(opt);
  }
  return opts.sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
}

/**
 * Build assignee options from in-memory contacts — everyone on the project.
 * @returns {{ contactId: string, userId: string|null, label: string, email?: string|null, phone?: string|null }[]}
 */
export function buildIssueAssigneeOptionsFromContacts(
  contacts = [],
  { projectId = null, organizationId = null, fallbackLabel = 'Team member' } = {},
) {
  const list = contacts || [];
  let pool = list.filter((contact) => isContactOnProject(contact, projectId));

  // If nobody is linked to the project yet, fall back to org team directory.
  if (pool.length === 0) {
    pool = list.filter((contact) => {
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

  return dedupeByContactId(
    pool.map((c) => optionFromProjectContact(c, fallbackLabel)).filter(Boolean),
  );
}

/**
 * Resolve DB assignee columns from a selected contact option / id.
 * Virtual profile rows (no real contact) only set assigned_to_user_id.
 */
export function resolveIssueAssigneePatch(optionOrContactId, options = []) {
  if (optionOrContactId && typeof optionOrContactId === 'object') {
    const opt = optionOrContactId;
    if (opt.isVirtualProfile) {
      return { assigned_to_contact_id: null, assigned_to_user_id: opt.userId || null };
    }
    return {
      assigned_to_contact_id: opt.contactId || null,
      assigned_to_user_id: opt.userId || null,
    };
  }

  const id = optionOrContactId ? String(optionOrContactId) : '';
  if (!id) {
    return { assigned_to_contact_id: null, assigned_to_user_id: null };
  }

  const match = (options || []).find((o) => o.contactId === id || o.userId === id);
  if (match?.isVirtualProfile) {
    return { assigned_to_contact_id: null, assigned_to_user_id: match.userId || null };
  }
  if (match) {
    return {
      assigned_to_contact_id: match.contactId,
      assigned_to_user_id: match.userId || null,
    };
  }

  if (isUuid(id)) {
    return { assigned_to_contact_id: id, assigned_to_user_id: null };
  }
  return { assigned_to_contact_id: null, assigned_to_user_id: null };
}

/**
 * Load assignee options for a project (mobile / server-friendly).
 * Returns every project contact; includes userId when a profile is linked.
 */
export async function fetchIssueAssigneeOptions(supabase, args = {}) {
  const {
    projectId,
    organizationId = null,
    fallbackLabel = 'Team member',
  } = args;

  if (!supabase || !projectId) return [];

  let rows = [];
  const withFk = await supabase
    .from('project_contacts')
    .select('contact_id, contacts!fk_project_contacts_contact_id(id, name, email, phone, type)')
    .eq('project_id', projectId);

  if (withFk.error) {
    const plain = await supabase
      .from('project_contacts')
      .select('contact_id')
      .eq('project_id', projectId);
    if (plain.error) throw plain.error;
    rows = plain.data || [];
  } else {
    rows = withFk.data || [];
  }

  let contactIds = [...new Set(
    (rows || []).map((row) => row.contact_id || row.contacts?.id).filter((id) => isUuid(id)),
  )];

  // Fall back to org team contacts when the project has nobody linked yet.
  if (contactIds.length === 0 && organizationId) {
    const { data: orgContacts, error: orgErr } = await supabase
      .from('contacts')
      .select('id, name, email, phone, type')
      .eq('organization_id', organizationId)
      .in('type', ['Team', 'Subcontractor']);
    if (orgErr) throw orgErr;
    rows = (orgContacts || []).map((c) => ({ contact_id: c.id, contacts: c }));
    contactIds = (orgContacts || []).map((c) => c.id).filter((id) => isUuid(id));
  }

  if (contactIds.length === 0) return [];

  // Load contact rows when embed was missing.
  const needContactFetch = (rows || []).some((r) => !r.contacts?.name && !r.contacts?.email);
  let contactById = new Map();
  if (needContactFetch) {
    const { data: contacts, error: cErr } = await supabase
      .from('contacts')
      .select('id, name, email, phone, type')
      .in('id', contactIds);
    if (cErr) throw cErr;
    contactById = new Map((contacts || []).map((c) => [c.id, c]));
  } else {
    for (const row of rows || []) {
      const c = row.contacts;
      const id = row.contact_id || c?.id;
      if (id && c) contactById.set(id, { ...c, id });
    }
  }

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, contact_id')
    .in('contact_id', contactIds);
  if (pErr) throw pErr;
  const userByContact = new Map((profiles || []).map((p) => [p.contact_id, p.id]));

  const opts = contactIds.map((contactId) => {
    const c = contactById.get(contactId) || { id: contactId };
    const email = c.email ? String(c.email).trim() : null;
    const phone = c.phone ? String(c.phone).trim() : null;
    return {
      contactId,
      userId: userByContact.get(contactId) || null,
      label: c.name || c.email || fallbackLabel,
      email: email && email.includes('@') ? email : null,
      phone: phone || null,
      isVirtualProfile: false,
    };
  });

  return dedupeByContactId(opts);
}
