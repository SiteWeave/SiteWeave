/** Staff crew deployment statuses (contacts.type = Team only). */
export const STAFF_DEPLOYMENT_STATUSES = ['assigned', 'available', 'off', 'pto'];

const LEGACY_STATUS_MAP = {
  Available: 'available',
  Offline: 'available',
  Inactive: 'available',
  Busy: 'assigned',
  'On Site': 'assigned',
  Unavailable: 'off',
  'On Leave': 'pto',
  assigned: 'assigned',
  available: 'available',
  off: 'off',
  pto: 'pto',
};

/**
 * Normalize raw contacts.status to crew deployment enum for staff; null for trade partners.
 * @param {string|null|undefined} raw
 * @param {string} contactType
 * @returns {string|null}
 */
export function normalizeDeploymentStatus(raw, contactType = 'Team') {
  if (contactType === 'Subcontractor') return null;
  if (!raw) return 'available';
  return LEGACY_STATUS_MAP[raw] || (STAFF_DEPLOYMENT_STATUSES.includes(raw) ? raw : 'available');
}

/**
 * Batch-fetch project assignment + today's open tasks for staff contacts.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} staffContactIds
 * @param {string} orgId
 * @param {Record<string, string>} [projectNamesById]
 * @returns {Promise<Record<string, { assignedProjectIds: string[], assignedProjectNames: string[], tasksDueToday: number, primaryProjectId: string|null, primaryProjectName: string|null }>>}
 */
export async function getStaffDeploymentContext(supabase, staffContactIds, orgId, projectNamesById = {}) {
  if (!staffContactIds?.length || !orgId) return {};

  const today = new Date().toISOString().split('T')[0];
  const contextByContact = {};

  staffContactIds.forEach((id) => {
    contextByContact[id] = {
      assignedProjectIds: [],
      assignedProjectNames: [],
      tasksDueToday: 0,
      primaryProjectId: null,
      primaryProjectName: null,
    };
  });

  const [{ data: projectContacts }, { data: tasksToday }] = await Promise.all([
    supabase
      .from('project_contacts')
      .select('contact_id, project_id')
      .in('contact_id', staffContactIds)
      .eq('organization_id', orgId),
    supabase
      .from('tasks')
      .select('assignee_id, project_id')
      .in('assignee_id', staffContactIds)
      .eq('organization_id', orgId)
      .eq('due_date', today)
      .eq('completed', false),
  ]);

  (projectContacts || []).forEach((pc) => {
    const ctx = contextByContact[pc.contact_id];
    if (!ctx) return;
    const pid = String(pc.project_id);
    if (!ctx.assignedProjectIds.includes(pid)) {
      ctx.assignedProjectIds.push(pid);
      const name = projectNamesById[pid];
      if (name) ctx.assignedProjectNames.push(name);
    }
  });

  const taskCountByContactProject = {};
  (tasksToday || []).forEach((task) => {
    const ctx = contextByContact[task.assignee_id];
    if (!ctx) return;
    ctx.tasksDueToday += 1;
    const key = `${task.assignee_id}:${task.project_id}`;
    taskCountByContactProject[key] = (taskCountByContactProject[key] || 0) + 1;
  });

  staffContactIds.forEach((contactId) => {
    const ctx = contextByContact[contactId];
    let bestProjectId = null;
    let bestCount = 0;
    Object.entries(taskCountByContactProject).forEach(([key, count]) => {
      const [cid, pid] = key.split(':');
      if (cid === contactId && count > bestCount) {
        bestCount = count;
        bestProjectId = pid;
      }
    });
    if (!bestProjectId && ctx.assignedProjectIds.length > 0) {
      bestProjectId = ctx.assignedProjectIds[0];
    }
    if (bestProjectId) {
      ctx.primaryProjectId = bestProjectId;
      ctx.primaryProjectName = projectNamesById[bestProjectId] || null;
    }
  });

  return contextByContact;
}

/**
 * Update a staff contact's self-reported deployment status.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} contactId
 * @param {{ status: string, primaryProjectId?: string|null }} payload
 */
export async function updateStaffDeployment(supabase, contactId, { status, primaryProjectId = null }) {
  if (!STAFF_DEPLOYMENT_STATUSES.includes(status)) {
    throw new Error(`Invalid deployment status: ${status}`);
  }

  const update = {
    status,
    status_updated_at: new Date().toISOString(),
    primary_project_id: status === 'assigned' ? primaryProjectId : null,
  };

  const { data, error } = await supabase
    .from('contacts')
    .update(update)
    .eq('id', contactId)
    .eq('type', 'Team')
    .select('id, status, primary_project_id, status_updated_at')
    .single();

  if (error) throw error;
  return data;
}
