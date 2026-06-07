/** Workspace tier checks for edge functions (service role). */

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any

export const GUEST_COLLABORATOR_LIMIT_ERROR = 'GUEST_COLLABORATOR_LIMIT_REACHED'
export const EXPORT_FEATURE_LOCKED_ERROR = 'EXPORT_FEATURE_LOCKED'
export const CUSTOM_ROLES_LOCKED_ERROR = 'CUSTOM_ROLES_LOCKED'
export const COMMS_FEATURE_LOCKED_ERROR = 'COMMS_FEATURE_LOCKED'

export type OrgTierRow = {
  workspace_type: string
  max_projects: number | null
  lifetime_projects_created: number
  max_guest_collaborators_per_project: number | null
  trial_ends_at: string | null
}

export async function getOrganizationTier(
  supabase: SupabaseAdmin,
  organizationId: string,
): Promise<OrgTierRow | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('workspace_type, max_projects, lifetime_projects_created, max_guest_collaborators_per_project, trial_ends_at')
    .eq('id', organizationId)
    .maybeSingle()
  if (error || !data) return null
  return data
}

export function isPersonalWorkspace(org: { workspace_type?: string } | null): boolean {
  return org?.workspace_type === 'personal'
}

export function isOnPersonalTrial(org: { workspace_type?: string; trial_ends_at?: string | null } | null): boolean {
  if (!isPersonalWorkspace(org) || !org?.trial_ends_at) return false
  return new Date(org.trial_ends_at) > new Date()
}

export function hasFullTierAccess(org: { workspace_type?: string; trial_ends_at?: string | null } | null): boolean {
  if (!org) return false
  if (!isPersonalWorkspace(org)) return true
  return isOnPersonalTrial(org)
}

export async function countProjectGuestSeats(
  supabase: SupabaseAdmin,
  projectId: string,
): Promise<number> {
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
  ])
  return (collabRes.count ?? 0) + (inviteRes.count ?? 0)
}

export async function assertCanInviteGuestCollaborator(
  supabase: SupabaseAdmin,
  organizationId: string,
  projectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const org = await getOrganizationTier(supabase, organizationId)
  if (!org || !isPersonalWorkspace(org)) return { ok: true }
  if (hasFullTierAccess(org)) return { ok: true }

  const cap = org.max_guest_collaborators_per_project ?? 5
  const seats = await countProjectGuestSeats(supabase, projectId)
  if (seats >= cap) {
    return { ok: false, error: GUEST_COLLABORATOR_LIMIT_ERROR }
  }
  return { ok: true }
}

export async function assertCanExportProfessionalDocs(
  supabase: SupabaseAdmin,
  organizationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const org = await getOrganizationTier(supabase, organizationId)
  if (!org) return { ok: false, error: 'Organization not found' }
  if (!hasFullTierAccess(org)) {
    return { ok: false, error: EXPORT_FEATURE_LOCKED_ERROR }
  }
  return { ok: true }
}

export async function assertHasFullTierAccess(
  supabase: SupabaseAdmin,
  organizationId: string,
): Promise<{ ok: true; org: OrgTierRow } | { ok: false; error: string }> {
  const org = await getOrganizationTier(supabase, organizationId)
  if (!org) return { ok: false, error: 'Organization not found' }
  if (!hasFullTierAccess(org)) {
    return { ok: false, error: COMMS_FEATURE_LOCKED_ERROR }
  }
  return { ok: true, org }
}
