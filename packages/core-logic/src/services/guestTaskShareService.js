/**
 * Create a guest task share link via edge function (service_role insert).
 */

export async function createGuestTaskShareLink(supabase, { projectId, organizationId, taskIds }) {
  const ids = Array.isArray(taskIds) ? taskIds.filter(Boolean) : [];
  if (!projectId || !organizationId || !ids.length) {
    throw new Error('projectId, organizationId, and taskIds are required');
  }

  const { data, error } = await supabase.functions.invoke('create-guest-task-share', {
    body: {
      project_id: projectId,
      organization_id: organizationId,
      task_ids: ids,
      source: 'manual_reminder',
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.url) throw new Error('Share link was not returned');

  return { url: data.url, rawToken: data.rawToken || null };
}
