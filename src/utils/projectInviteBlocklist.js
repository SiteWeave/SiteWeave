/**
 * Emails that must not be invited to a project via Share / invite_or_add_member.
 */

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

/**
 * Resolve project owner's contact id (same fallbacks as ProjectModal).
 */
export function resolveOwnerContactId({
  project,
  user,
  userContactId,
  profiles = [],
  contacts = [],
}) {
  if (project?.created_by_user_id) {
    const creatorProfile = profiles.find((p) => p.id === project.created_by_user_id);
    if (creatorProfile?.contact_id) return creatorProfile.contact_id;
  }
  if (user?.id && project?.created_by_user_id === user.id && userContactId) {
    return userContactId;
  }
  const userEmail = normalizeEmail(user?.email);
  if (userEmail) {
    const match = contacts.find((c) => normalizeEmail(c.email) === userEmail);
    if (match?.id) return match.id;
  }
  if (project?.project_manager_id && project.project_manager_id === user?.id && userContactId) {
    return userContactId;
  }
  return null;
}

/**
 * @returns {Set<string>} lowercase emails blocked from project invites
 */
export function getProjectInviteBlockedEmails({
  project,
  user,
  projectMembers = [],
  profiles = [],
  userContactId,
  contacts = [],
}) {
  const blocked = new Set();

  const userEmail = normalizeEmail(user?.email);
  if (userEmail) blocked.add(userEmail);

  const ownerContactId = resolveOwnerContactId({
    project,
    user,
    userContactId,
    profiles,
    contacts,
  });

  if (ownerContactId) {
    const ownerContact = contacts.find((c) => String(c.id) === String(ownerContactId));
    const ownerEmail = normalizeEmail(ownerContact?.email);
    if (ownerEmail) blocked.add(ownerEmail);
  }

  const ownerUserIds = [
    project?.created_by_user_id,
    project?.project_manager_id,
  ].filter(Boolean);

  for (const uid of ownerUserIds) {
    const profile = profiles.find((p) => p.id === uid);
    if (profile?.contact_id) {
      const c = contacts.find((x) => String(x.id) === String(profile.contact_id));
      const e = normalizeEmail(c?.email);
      if (e) blocked.add(e);
    }
  }

  for (const member of projectMembers) {
    const e = normalizeEmail(member?.email);
    if (e) blocked.add(e);
  }

  return blocked;
}

export function isBlockedProjectInviteEmail(email, blockedSet) {
  const e = normalizeEmail(email);
  return Boolean(e && blockedSet?.has(e));
}

export function getBlockedContactIds(contacts, blockedEmails) {
  const ids = new Set();
  for (const c of contacts || []) {
    if (isBlockedProjectInviteEmail(c.email, blockedEmails)) {
      ids.add(c.id);
    }
  }
  return ids;
}
