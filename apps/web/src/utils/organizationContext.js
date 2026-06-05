import { provisionPersonalWorkspace } from './workspaceClient';

/**
 * Resolves the organization id that Postgres RLS expects (profiles.organization_id)
 * and syncs AppContext before mutating org-scoped rows.
 */
export async function ensureOrganizationForWrites(
  supabase,
  { userId, accountIntent = 'workspace_owner', currentOrganization, dispatch },
) {
  if (!userId) {
    return { ok: false, error: 'Not authenticated' };
  }

  const loadProfileOrgId = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('organization_id, account_intent')
      .eq('id', userId)
      .maybeSingle();
    if (error) return { orgId: null, error: error.message };
    return { orgId: data?.organization_id ?? null, accountIntent: data?.account_intent };
  };

  let { orgId, error: profileError } = await loadProfileOrgId();
  if (profileError) {
    return { ok: false, error: profileError };
  }

  const intent = accountIntent || 'workspace_owner';

  if (!orgId && intent === 'workspace_owner') {
    const prov = await provisionPersonalWorkspace(supabase);
    if (prov?.success && prov.organization?.id) {
      orgId = prov.organization.id;
    } else if (!prov?.success) {
      return { ok: false, error: prov?.error || 'Could not link your workspace' };
    }
    ({ orgId } = await loadProfileOrgId());
  }

  if (!orgId) {
    return { ok: false, error: 'No organization linked to your account' };
  }

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (orgError || !org) {
    return { ok: false, error: orgError?.message || 'Organization not found' };
  }

  if (dispatch && currentOrganization?.id !== org.id) {
    dispatch({ type: 'SET_ORGANIZATION', payload: org });
    dispatch({ type: 'SET_ORGANIZATION_ERROR', payload: null });

    const { data: roleRow } = await supabase
      .from('profiles')
      .select('role_id, roles(*)')
      .eq('id', userId)
      .maybeSingle();

    if (roleRow?.roles) {
      dispatch({ type: 'SET_USER_ROLE', payload: roleRow.roles });
    }
  }

  return { ok: true, organizationId: orgId, organization: org };
}

export function isOrganizationRlsError(error) {
  const msg = String(error?.message || '');
  return (
    error?.code === '42501'
    || (msg.includes('row-level security') && msg.toLowerCase().includes('projects'))
  );
}
