export type ProjectCrewRole = 'PM' | 'Team' | 'Subcontractor' | 'Client'

export function mapOrgRoleToDefaultProjectCrewRole(orgRoleName: string | null | undefined): ProjectCrewRole {
  const n = (orgRoleName || '').trim().toLowerCase()
  if (!n) return 'Team'
  if (n.includes('project manager') || n === 'pm') return 'PM'
  if (n.includes('admin') || n === 'org admin') return 'PM'
  if (n.includes('client')) return 'Client'
  if (n.includes('subcontractor') || n.includes('sub')) return 'Subcontractor'
  return 'Team'
}

/**
 * When the client sends a generic Team default, infer from org profile if possible.
 */
export async function resolveProjectCrewRoleForInvite(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organizationId: string,
  email: string,
  entryRole?: string,
): Promise<string> {
  const normalized = (entryRole || '').trim()
  if (normalized && normalized !== 'Team') {
    return normalized
  }

  const { data: contactRow } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', organizationId)
    .ilike('email', email)
    .maybeSingle()

  if (!contactRow?.id) {
    return 'Subcontractor'
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('roles(name)')
    .eq('organization_id', organizationId)
    .eq('contact_id', contactRow.id)
    .maybeSingle()

  const orgRoleName = profile?.roles?.name as string | undefined
  if (orgRoleName) {
    return mapOrgRoleToDefaultProjectCrewRole(orgRoleName)
  }

  return 'Subcontractor'
}
