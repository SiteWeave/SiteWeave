/** @typedef {'PM' | 'Team' | 'Subcontractor' | 'Client'} ProjectCrewRole */

/** @type {readonly ProjectCrewRole[]} */
export const PROJECT_CREW_ROLES = Object.freeze(['PM', 'Team', 'Subcontractor', 'Client']);

const GUEST_DEFAULT_ROLE = 'Subcontractor';

/**
 * Map company access role name to default project crew role.
 * @param {string | null | undefined} orgRoleName
 * @returns {ProjectCrewRole}
 */
export function mapOrgRoleToDefaultProjectCrewRole(orgRoleName) {
  const n = (orgRoleName || '').trim().toLowerCase();
  if (!n) return 'Team';

  if (n.includes('project manager') || n === 'pm') return 'PM';
  if (n.includes('admin') || n === 'org admin') return 'PM';
  if (n.includes('client')) return 'Client';
  if (n.includes('subcontractor') || n.includes('sub')) return 'Subcontractor';

  return 'Team';
}

/**
 * Default project crew role when adding a contact to a project.
 * @param {{
 *   orgRoleName?: string | null;
 *   contactType?: string | null;
 *   hasOrgAccount?: boolean;
 * }} opts
 * @returns {ProjectCrewRole}
 */
export function defaultProjectCrewRoleForContact({
  orgRoleName = null,
  contactType = null,
  hasOrgAccount = false,
} = {}) {
  if (orgRoleName) {
    return mapOrgRoleToDefaultProjectCrewRole(orgRoleName);
  }

  const type = (contactType || '').trim().toLowerCase();
  if (type === 'client') return 'Client';
  if (type === 'subcontractor') return 'Subcontractor';
  if (hasOrgAccount) return 'Team';

  return GUEST_DEFAULT_ROLE;
}

/**
 * Short display label for a project crew role value (English fallback).
 * @param {string | null | undefined} role
 * @returns {string}
 */
export function projectCrewRoleShortLabel(role) {
  switch (role) {
    case 'PM':
      return 'Project Manager';
    case 'Team':
      return 'Team';
    case 'Subcontractor':
      return 'Subcontractor';
    case 'Client':
      return 'Client';
    default:
      return role || 'Team';
  }
}
