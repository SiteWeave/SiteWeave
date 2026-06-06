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
