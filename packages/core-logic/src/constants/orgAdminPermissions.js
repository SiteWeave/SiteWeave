/** Canonical Org Admin permission flags (keep in sync with ensureDefaultRoles.ts). */
export const ORG_ADMIN_PERMISSIONS = {
  can_manage_team: true,
  can_manage_users: true,
  can_manage_roles: true,
  can_create_projects: true,
  can_edit_projects: true,
  can_delete_projects: true,
  can_assign_tasks: true,
  can_manage_contacts: true,
  can_create_tasks: true,
  can_edit_tasks: true,
  can_delete_tasks: true,
  can_send_messages: true,
  can_view_activity_history: true,
  can_manage_progress_reports: true,
  can_manage_org_progress_reports: true,
};

/** Permissions to show in UI for a role (Org Admin always shows full access). */
export function getRolePermissionsForDisplay(role) {
  if (role?.name === 'Org Admin') {
    return { ...ORG_ADMIN_PERMISSIONS };
  }
  return role?.permissions || {};
}
