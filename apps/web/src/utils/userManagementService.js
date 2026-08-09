/**
 * User Management Service
 * Handles user invitation and management for Organization Admins.
 * Invite / create go through edge functions (service role + email), never client auth.admin.
 */

async function getAccessToken(supabase) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  return session.access_token;
}

function edgeBaseUrl(supabase) {
  return supabase.supabaseUrl || supabase.restUrl?.replace(/\/rest\/v1\/?$/, '') || '';
}

async function postEdgeFunction(supabase, functionName, body) {
  const accessToken = await getAccessToken(supabase);
  const base = edgeBaseUrl(supabase);
  const response = await fetch(`${base}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    const text = await response.text().catch(() => '');
    return {
      success: false,
      error: text || `Server error: ${response.status}`,
    };
  }

  if (!response.ok || result?.success === false) {
    return {
      success: false,
      error: result?.error || `Server error: ${response.status}`,
      ...result,
    };
  }

  return { success: true, ...result };
}

/**
 * Invite a user to join the organization (sends email via team-invite).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} email
 * @param {string} organizationId
 * @param {string|null} [roleId]
 * @param {string} [_invitedByUserId] unused — edge function uses session user
 * @param {Record<string, unknown>} [metadata]
 */
export async function inviteUser(
  supabase,
  email,
  organizationId,
  roleId = null,
  _invitedByUserId = null,
  metadata = undefined,
) {
  try {
    if (!email || !organizationId) {
      return { success: false, error: 'Missing required fields: email, organizationId' };
    }

    const body = {
      email: String(email).toLowerCase(),
      organizationId,
      roleId: roleId || null,
    };
    if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
      body.metadata = metadata;
    }

    return await postEdgeFunction(supabase, 'team-invite', body);
  } catch (error) {
    console.error('Error inviting user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a managed user account (PIN login) via team-create-user.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @param {string} params.fullName
 * @param {string} params.username
 * @param {string} params.password 6-digit PIN
 * @param {string} params.organizationId
 * @param {string|null} [params.roleId]
 */
export async function createUser(supabase, params) {
  try {
    const { fullName, username, password, organizationId, roleId = null } = params || {};

    if (!fullName || !username || !password || !organizationId) {
      return {
        success: false,
        error: 'Missing required fields: fullName, username, password, organizationId',
      };
    }

    return await postEdgeFunction(supabase, 'team-create-user', {
      fullName,
      username,
      password,
      organizationId,
      roleId: roleId || null,
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove a user from the organization
 */
export async function removeUserFromOrganization(supabase, userId, organizationId) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        organization_id: null,
        role_id: null,
      })
      .eq('id', userId)
      .eq('organization_id', organizationId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error removing user from organization:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all users in an organization
 */
export async function getOrganizationUsers(supabase, organizationId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        role_id,
        contact_id,
        is_super_admin,
        created_at,
        roles (
          id,
          name,
          permissions
        ),
        contacts!fk_profiles_contact (
          id,
          name,
          email,
          avatar_url
        )
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching organization users:', error);
    throw error;
  }
}
