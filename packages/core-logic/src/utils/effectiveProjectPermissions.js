/**
 * Project-scoped permissions when the viewer is a guest collaborator
 * or a home-org member of a different org than the project's.
 *
 * Org members on their home-org projects keep `profiles.role_id` permissions.
 * Cross-org / guest-only access uses project_collaborators.access_level.
 */

const DENY_ALL = Object.freeze({
  can_manage_team: false,
  can_manage_users: false,
  can_manage_roles: false,
  can_create_projects: false,
  can_edit_projects: false,
  can_delete_projects: false,
  can_assign_tasks: false,
  can_manage_contacts: false,
  can_create_tasks: false,
  can_edit_tasks: false,
  can_delete_tasks: false,
  can_send_messages: false,
  can_view_activity_history: false,
  can_manage_progress_reports: false,
  can_manage_org_progress_reports: false,
});

const VIEWER_PERMS = Object.freeze({
  ...DENY_ALL,
  can_send_messages: true,
});

const EDITOR_PERMS = Object.freeze({
  ...DENY_ALL,
  can_create_tasks: true,
  can_edit_tasks: true,
  can_assign_tasks: true,
  can_send_messages: true,
});

const COLLAB_ADMIN_PERMS = Object.freeze({
  ...DENY_ALL,
  can_edit_projects: true,
  can_manage_contacts: true,
  can_create_tasks: true,
  can_edit_tasks: true,
  can_delete_tasks: true,
  can_assign_tasks: true,
  can_send_messages: true,
  can_view_activity_history: true,
});

/**
 * @param {string | null | undefined} accessLevel
 * @returns {typeof DENY_ALL}
 */
export function permissionsForCollaboratorAccessLevel(accessLevel) {
  const level = String(accessLevel || 'viewer').toLowerCase();
  if (level === 'admin') return { ...COLLAB_ADMIN_PERMS };
  if (level === 'editor') return { ...EDITOR_PERMS };
  return { ...VIEWER_PERMS };
}

/**
 * @param {{
 *   orgPermissions?: Record<string, boolean> | null;
 *   projectOrganizationId?: string | null;
 *   homeOrganizationId?: string | null;
 *   collaboratorAccessLevel?: string | null;
 * }} opts
 * @returns {Record<string, boolean> & { source: string }}
 */
export function getEffectiveProjectPermissions({
  orgPermissions = null,
  projectOrganizationId = null,
  homeOrganizationId = null,
  collaboratorAccessLevel = null,
} = {}) {
  const isHomeOrgMember = Boolean(
    homeOrganizationId
    && projectOrganizationId
    && String(homeOrganizationId) === String(projectOrganizationId),
  );

  if (isHomeOrgMember) {
    return {
      ...DENY_ALL,
      ...(orgPermissions || {}),
      source: 'org',
    };
  }

  if (collaboratorAccessLevel) {
    return {
      ...permissionsForCollaboratorAccessLevel(collaboratorAccessLevel),
      source: 'collaborator',
    };
  }

  // Not home org and not a collaborator — no project powers
  return { ...DENY_ALL, source: 'none' };
}

/**
 * Resolve access_level for a project from collaboration rows.
 * @param {Array<{ id?: string, project_id?: string, access_level?: string }>} collaborationProjects
 * @param {string | null | undefined} projectId
 * @returns {string | null}
 */
export function resolveCollaboratorAccessLevel(collaborationProjects, projectId) {
  if (!projectId || !Array.isArray(collaborationProjects)) return null;
  const row = collaborationProjects.find(
    (p) => String(p.id || p.project_id) === String(projectId),
  );
  return row?.access_level || null;
}
