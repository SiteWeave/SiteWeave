/**
 * Whether the founding admin should see the first-run setup wizard.
 * Prefer founder ownership over exact role name so invite claim + personal
 * workspace provision always surface the wizard when still pending.
 */
export function shouldShowSetupWizard({ user, userRole, org, mustChangePassword }) {
  if (!user?.id || !org?.id || mustChangePassword) return false;
  if (org.setup_wizard_completed_at) return false;

  const isFounder =
    org.created_by_user_id != null && org.created_by_user_id === user.id;
  if (!isFounder) return false;

  // Role may briefly be null after provision; still show for founders.
  if (!userRole) return true;

  const roleName = userRole.name;
  const isAdmin =
    roleName === 'Org Admin' ||
    roleName === 'Admin' ||
    userRole.permissions?.can_manage_roles === true ||
    userRole.permissions?.can_manage_team === true;

  return isAdmin;
}

/**
 * Broad checklist eligibility (founders + org admins who manage team/roles).
 */
export function isEligibleForActivationChecklist({ user, userRole, org }) {
  if (!user?.id || !org?.id) return false;
  if (org.created_by_user_id != null && org.created_by_user_id === user.id) {
    return true;
  }
  const roleName = userRole?.name;
  return (
    roleName === 'Org Admin' ||
    roleName === 'Admin' ||
    userRole?.permissions?.can_manage_roles === true ||
    userRole?.permissions?.can_manage_team === true
  );
}
