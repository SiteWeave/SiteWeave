/**
 * Project trash lifecycle — move to trash, restore, list trashed, permanent purge.
 */

export const PROJECT_TRASH_RETENTION_DAYS = 30;

export const TRASHED_PROJECT_COLUMNS = [
  'id',
  'name',
  'status',
  'due_date',
  'start_date',
  'project_type',
  'organization_id',
  'address',
  'updated_at',
  'created_at',
  'trashed_at',
  'trashed_by',
  'purge_after',
  'project_manager_id',
  'created_by_user_id',
].join(',');

/**
 * Move a project to trash (soft delete). Recoverable for 30 days.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 */
export async function trashProject(supabase, projectId) {
  const { data, error } = await supabase.rpc('trash_project', { p_project_id: projectId });
  if (error) throw error;
  return data;
}

/**
 * Restore a trashed project.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 */
export async function restoreProject(supabase, projectId) {
  const { data, error } = await supabase.rpc('restore_project', { p_project_id: projectId });
  if (error) throw error;
  return data;
}

/**
 * List trashed projects for the current organization (requires trash management permission).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function fetchTrashedProjects(supabase) {
  const { data, error } = await supabase.rpc('list_trashed_projects');
  if (error) throw error;
  return data || [];
}

/**
 * Permanently delete a trashed project via edge function (includes storage cleanup).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ projectId: string, confirmName: string }} params
 */
export async function purgeProjectPermanently(supabase, { projectId, confirmName }) {
  const { data, error } = await supabase.functions.invoke('purge-project', {
    body: { projectId, confirmName },
  });
  if (error) throw error;
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}
