import { provisionPersonalWorkspace } from './workspaceClient';

export async function ensureOrganizationForWrites(supabase, { userId, currentOrganization } = {}) {
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

  if (!orgId && currentOrganization?.id) {
    orgId = currentOrganization.id;
  }

  if (!orgId) {
    const prov = await provisionPersonalWorkspace(supabase, { force: true });
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

  return { ok: true, organizationId: orgId, organization: org };
}
