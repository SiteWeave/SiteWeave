/**
 * Activity Service
 * Handles activity log operations
 */

/**
 * Best-effort insert into activity_log. Never throws to callers.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @param {string} params.action
 * @param {string} params.entityType
 * @param {string} [params.entityId]
 * @param {string} [params.entityName]
 * @param {string} [params.projectId]
 * @param {string} [params.organizationId]
 * @param {string} [params.userId]
 * @param {string} [params.userName]
 * @param {object|null} [params.details]
 */
const recentActivityKeys = new Map();
const ACTIVITY_DEDUPE_MS = 2500;

function shouldSkipDuplicateActivity(action, entityType, entityId) {
  if (!action || !entityType || !entityId) return false;
  const key = `${action}:${entityType}:${entityId}`;
  const now = Date.now();
  const prev = recentActivityKeys.get(key);
  if (prev && now - prev < ACTIVITY_DEDUPE_MS) return true;
  recentActivityKeys.set(key, now);
  if (recentActivityKeys.size > 200) {
    for (const [k, ts] of recentActivityKeys) {
      if (now - ts > ACTIVITY_DEDUPE_MS) recentActivityKeys.delete(k);
    }
  }
  return false;
}

export async function recordActivity(supabase, params = {}) {
  try {
    let {
      action,
      entityType,
      entityId = null,
      entityName = null,
      projectId = null,
      organizationId = null,
      userId = null,
      userName = null,
      details = null,
    } = params;

    if (!action || !entityType) return null;

    if (shouldSkipDuplicateActivity(action, entityType, entityId)) {
      return null;
    }

    if (!userId) {
      const { data: authData } = await supabase.auth.getUser();
      userId = authData?.user?.id || null;
      if (!userName && !userName) {
        userName = authData?.user?.user_metadata?.full_name || authData?.user?.email || null;
      }
    }

    let orgId = organizationId || null;
    if (!orgId && projectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('organization_id')
        .eq('id', projectId)
        .maybeSingle();
      orgId = project?.organization_id || null;
    }
    if (!orgId) {
      console.warn('[activity] skip: missing organization_id');
      return null;
    }

    if (!userName && userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('contacts(name)')
        .eq('id', userId)
        .maybeSingle();
      userName = profile?.contacts?.name || 'User';
    }

    const row = {
      action: String(action),
      entity_type: String(entityType),
      entity_id: entityId || null,
      entity_name: entityName || null,
      project_id: projectId || null,
      organization_id: orgId,
      user_id: userId || null,
      user_name: userName || 'User',
      details: details ?? null,
    };

    const { data, error } = await supabase.from('activity_log').insert(row).select('id').maybeSingle();
    if (error) {
      console.warn('[activity] insert failed:', error.message);
      return null;
    }
    return data?.id || null;
  } catch (err) {
    console.warn('[activity] recordActivity threw:', err);
    return null;
  }
}

/**
 * Fetch recent activity log entries
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {number} limit - Number of entries to fetch (default: 50)
 * @returns {Promise<Array>} Array of activity log entries
 */
export async function fetchActivityLog(supabase, limit = 50) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data || [];
}

/**
 * Fetch recent activity for a specific user
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - User ID
 * @param {number} limit - Number of entries to fetch (default: 10)
 * @returns {Promise<Array>} Array of activity log entries
 */
export async function fetchUserActivity(supabase, userId, limit = 10) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data || [];
}

