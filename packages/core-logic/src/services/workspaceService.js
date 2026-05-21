/**

 * Workspace / account-type helpers for personal vs business orgs and guest collaborators.

 */



import {

  ACCOUNT_INTENTS,

  CUSTOM_ROLES_LOCKED_ERROR,

  DEFAULT_PERSONAL_MAX_GUEST_COLLABORATORS_PER_PROJECT,

  DEFAULT_PERSONAL_MAX_PROJECTS,

  EXPORT_FEATURE_LOCKED_ERROR,

  GUEST_COLLABORATOR_LIMIT_ERROR,

  WORKSPACE_TYPES,

} from '../constants/workspace.js';



export function isPersonalWorkspace(org) {

  return org?.workspace_type === WORKSPACE_TYPES.PERSONAL;

}



export function isBusinessWorkspace(org) {

  return !org?.workspace_type || org.workspace_type === WORKSPACE_TYPES.BUSINESS;

}



export function getProjectLimit(org) {

  if (!org || !isPersonalWorkspace(org)) return null;

  return org.max_projects ?? DEFAULT_PERSONAL_MAX_PROJECTS;

}



export function getGuestCollaboratorLimit(org) {

  if (!org || !isPersonalWorkspace(org)) return null;

  return org.max_guest_collaborators_per_project ?? DEFAULT_PERSONAL_MAX_GUEST_COLLABORATORS_PER_PROJECT;

}



/** Business tier: branded PDF / CSV / data exports */

export function canExportProfessionalDocs(org) {

  return isBusinessWorkspace(org);

}



/** Business tier: custom roles and granular permission matrices */

export function canUseCustomRoles(org) {

  return isBusinessWorkspace(org);

}



/**

 * @param {import('@supabase/supabase-js').SupabaseClient} supabase

 * @param {string} organizationId

 * @param {{ accountIntent?: string, isGuestCollaborator?: boolean }} [opts]

 */

export async function canCreateProject(supabase, organizationId, opts = {}) {

  const { accountIntent, isGuestCollaborator } = opts;



  if (accountIntent === ACCOUNT_INTENTS.GUEST_ONLY) {

    return false;

  }

  if (isGuestCollaborator) {

    return false;

  }

  if (!organizationId) {

    return false;

  }



  const { data: org, error: orgError } = await supabase

    .from('organizations')

    .select('workspace_type, max_projects, lifetime_projects_created')

    .eq('id', organizationId)

    .maybeSingle();



  if (orgError || !org) return false;

  if (!isPersonalWorkspace(org)) return true;



  const limit = getProjectLimit(org);

  const lifetimeCreated = org.lifetime_projects_created ?? 0;

  return lifetimeCreated < limit;

}



/**

 * @param {import('@supabase/supabase-js').SupabaseClient} supabase

 * @param {string} organizationId

 * @param {string} projectId

 */

export async function canInviteGuestCollaborator(supabase, organizationId, projectId) {

  if (!organizationId || !projectId) return false;



  const { data: org, error: orgError } = await supabase

    .from('organizations')

    .select('workspace_type, max_guest_collaborators_per_project')

    .eq('id', organizationId)

    .maybeSingle();



  if (orgError || !org) return false;

  if (!isPersonalWorkspace(org)) return true;



  const cap = getGuestCollaboratorLimit(org);



  const [collabRes, inviteRes] = await Promise.all([

    supabase

      .from('project_collaborators')

      .select('id', { count: 'exact', head: true })

      .eq('project_id', projectId),

    supabase

      .from('project_access_invites')

      .select('id', { count: 'exact', head: true })

      .eq('project_id', projectId)

      .eq('status', 'pending'),

  ]);



  if (collabRes.error || inviteRes.error) return false;

  const seats = (collabRes.count ?? 0) + (inviteRes.count ?? 0);

  return seats < cap;

}



export function isProjectLimitError(error) {

  const msg = error?.message || String(error || '');

  const code = error?.code || '';

  return (

    msg.includes('PROJECT_LIMIT_REACHED') ||

    msg.includes('Personal workspace project limit') ||

    code === 'P0001'

  );

}



export function isGuestCollaboratorLimitError(error) {

  const msg = error?.message || String(error || '');

  return msg.includes(GUEST_COLLABORATOR_LIMIT_ERROR) || msg.includes('guest collaborator limit');

}



export function isExportFeatureLockedError(error) {

  const msg = error?.message || String(error || '');

  return msg.includes(EXPORT_FEATURE_LOCKED_ERROR) || msg.includes('Export is available on business');

}



export function isCustomRolesLockedError(error) {

  const msg = error?.message || String(error || '');

  return msg.includes(CUSTOM_ROLES_LOCKED_ERROR) || msg.includes('Custom roles are available on business');

}



export { EXPORT_FEATURE_LOCKED_ERROR, CUSTOM_ROLES_LOCKED_ERROR, GUEST_COLLABORATOR_LIMIT_ERROR };


