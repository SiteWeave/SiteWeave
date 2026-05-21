/**
 * Role Management Service
 * Handles CRUD operations for dynamic roles
 */

import { canUseCustomRoles, CUSTOM_ROLES_LOCKED_ERROR } from '@siteweave/core-logic';

async function assertCustomRolesAllowed(supabase, organizationId) {
  const { data: org, error } = await supabase
    .from('organizations')
    .select('workspace_type')
    .eq('id', organizationId)
    .maybeSingle();
  if (error || !org) throw new Error('Organization not found');
  if (!canUseCustomRoles(org)) {
    const err = new Error(CUSTOM_ROLES_LOCKED_ERROR);
    throw err;
  }
}

/**
 * Get all roles for an organization
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} organizationId - Organization ID
 * @returns {Promise<Array>} Array of roles
 */
export async function getRoles(supabase, organizationId) {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching roles:', error);
    throw error;
  }
}

/**
 * Get a single role by ID
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} roleId - Role ID
 * @returns {Promise<Object|null>} Role object or null
 */
export async function getRole(supabase, roleId) {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('id', roleId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching role:', error);
    throw error;
  }
}

/**
 * Create a new role
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} organizationId - Organization ID
 * @param {string} name - Role name
 * @param {Object} permissions - Permissions object (JSONB)
 * @returns {Promise<Object>} Created role
 */
export async function createRole(supabase, organizationId, name, permissions) {
  try {
    await assertCustomRolesAllowed(supabase, organizationId);
    const { data, error } = await supabase
      .from('roles')
      .insert({
        organization_id: organizationId,
        name,
        permissions,
        is_system_role: false,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating role:', error);
    throw error;
  }
}

/**
 * Update a role
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} roleId - Role ID
 * @param {Object} updates - Updates object (name, permissions, etc.)
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>} Result object
 */
export async function updateRole(supabase, roleId, updates) {
  try {
    if (!roleId) {
      return { success: false, error: 'Role ID is required' };
    }

    const existing = await getRole(supabase, roleId);
    if (!existing?.organization_id) {
      return { success: false, error: 'Role not found' };
    }
    await assertCustomRolesAllowed(supabase, existing.organization_id);

    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('roles')
      .update(updateData)
      .eq('id', roleId)
      .select()
      .single();

    if (error) {
      console.error('Error updating role:', error);
      // Check if role doesn't exist
      if (error.code === 'PGRST116' || error.message?.includes('0 rows')) {
        return { success: false, error: 'Role not found. It may have been deleted or you may not have permission to update it.' };
      }
      return { success: false, error: error.message || 'Failed to update role' };
    }

    if (!data) {
      return { success: false, error: 'Role not found or update returned no data' };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error updating role:', error);
    return { success: false, error: error.message || 'Failed to update role' };
  }
}

/**
 * Delete a role
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} roleId - Role ID
 * @returns {Promise<void>}
 */
export async function deleteRole(supabase, roleId) {
  try {
    const existing = await getRole(supabase, roleId);
    if (existing?.organization_id) {
      await assertCustomRolesAllowed(supabase, existing.organization_id);
    }
    const { error } = await supabase
      .from('roles')
      .delete()
      .eq('id', roleId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting role:', error);
    throw error;
  }
}

/**
 * If anyone in the org has fromRoleId, move them to toRoleId, then delete fromRoleId.
 * If nobody has that role, deletes without needing toRoleId.
 */
export async function reassignOrganizationMembersAndDeleteRole(
  supabase,
  organizationId,
  fromRoleId,
  toRoleId,
) {
  await assertCustomRolesAllowed(supabase, organizationId);
  const { count, error: countError } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('role_id', fromRoleId);

  if (countError) throw countError;

  const n = count ?? 0;
  if (n > 0) {
    if (!toRoleId) {
      throw new Error('Choose a role to move members to before deleting.');
    }
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role_id: toRoleId })
      .eq('organization_id', organizationId)
      .eq('role_id', fromRoleId);

    if (updateError) throw updateError;
  }

  await deleteRole(supabase, fromRoleId);
}

/**
 * Assign a role to a user
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - User ID
 * @param {string} roleId - Role ID
 * @returns {Promise<Object>} Updated profile
 */
export async function assignRoleToUser(supabase, userId, roleId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ role_id: roleId })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error assigning role to user:', error);
    throw error;
  }
}

