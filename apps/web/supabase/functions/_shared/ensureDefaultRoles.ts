/**
 * Ensures Member and Project Manager system roles exist for an organization.
 * Idempotent: safe to call on every invite / role load.
 */

/** Full permission set for Org Admin (must stay in sync with RoleCreationModal keys). */
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
} as const

export const MEMBER_PERMISSIONS = {
  can_manage_team: false,
  can_manage_users: false,
  can_manage_roles: false,
  can_create_projects: false,
  can_edit_projects: false,
  can_delete_projects: false,
  can_assign_tasks: false,
  can_manage_contacts: false,
  can_create_tasks: false,
  can_edit_tasks: true,
  can_delete_tasks: false,
  can_send_messages: true,
  can_view_activity_history: false,
} as const

export const PROJECT_MANAGER_PERMISSIONS = {
  can_manage_team: false,
  can_manage_users: false,
  can_manage_roles: false,
  can_create_projects: true,
  can_edit_projects: true,
  can_delete_projects: false,
  can_assign_tasks: true,
  can_manage_contacts: true,
  can_create_tasks: true,
  can_edit_tasks: true,
  can_delete_tasks: true,
  can_send_messages: true,
  can_manage_progress_reports: true,
  can_view_activity_history: true,
} as const

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any

export async function ensureDefaultRoles(
  supabase: SupabaseAdmin,
  organizationId: string,
): Promise<{ memberRoleId: string | null; projectManagerRoleId: string | null }> {
  const { data: existing, error: listError } = await supabase
    .from('roles')
    .select('id, name')
    .eq('organization_id', organizationId)
    .in('name', ['Member', 'Project Manager'])

  if (listError) {
    console.error('ensureDefaultRoles list error:', listError)
    throw listError
  }

  let memberRoleId = existing?.find((r: { name: string }) => r.name === 'Member')?.id ?? null
  let projectManagerRoleId = existing?.find((r: { name: string }) => r.name === 'Project Manager')?.id ?? null

  if (!memberRoleId) {
    const { data: memberRole, error: memberError } = await supabase
      .from('roles')
      .insert({
        organization_id: organizationId,
        name: 'Member',
        permissions: MEMBER_PERMISSIONS,
        is_system_role: true,
      })
      .select('id')
      .single()

    if (memberError) {
      console.error('ensureDefaultRoles Member insert:', memberError)
      throw memberError
    }
    memberRoleId = memberRole?.id ?? null
  } else {
    const { error: memberUpdateError } = await supabase
      .from('roles')
      .update({
        permissions: MEMBER_PERMISSIONS,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberRoleId)
    if (memberUpdateError) {
      console.error('ensureDefaultRoles Member update:', memberUpdateError)
      throw memberUpdateError
    }
  }

  if (!projectManagerRoleId) {
    const { data: pmRole, error: pmError } = await supabase
      .from('roles')
      .insert({
        organization_id: organizationId,
        name: 'Project Manager',
        permissions: PROJECT_MANAGER_PERMISSIONS,
        is_system_role: true,
      })
      .select('id')
      .single()

    if (pmError) {
      console.error('ensureDefaultRoles PM insert:', pmError)
      throw pmError
    }
    projectManagerRoleId = pmRole?.id ?? null
  }

  return { memberRoleId, projectManagerRoleId }
}

/** Merges canonical Org Admin permissions onto the org's Org Admin role. */
export async function ensureOrgAdminRolePermissions(
  supabase: SupabaseAdmin,
  organizationId: string,
): Promise<string | null> {
  const { data: role, error } = await supabase
    .from('roles')
    .select('id, permissions')
    .eq('organization_id', organizationId)
    .eq('name', 'Org Admin')
    .maybeSingle()

  if (error) {
    console.error('ensureOrgAdminRolePermissions select:', error)
    throw error
  }
  if (!role?.id) return null

  const { error: updateError } = await supabase
    .from('roles')
    .update({
      permissions: { ...(role.permissions || {}), ...ORG_ADMIN_PERMISSIONS },
      updated_at: new Date().toISOString(),
    })
    .eq('id', role.id)

  if (updateError) {
    console.error('ensureOrgAdminRolePermissions update:', updateError)
    throw updateError
  }
  return role.id
}

export async function resolveMemberRoleId(
  supabase: SupabaseAdmin,
  organizationId: string,
  preferredRoleId?: string | null,
): Promise<string | null> {
  if (preferredRoleId) {
    const { data: role } = await supabase
      .from('roles')
      .select('id')
      .eq('id', preferredRoleId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (role?.id) return role.id
  }

  const { memberRoleId } = await ensureDefaultRoles(supabase, organizationId)
  return memberRoleId
}
