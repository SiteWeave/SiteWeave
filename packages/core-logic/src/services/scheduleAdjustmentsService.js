/**
 * Schedule adjustments — early-completion pull-forward review records.
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 * @param {{ status?: string|string[] }} [options]
 */
export async function listScheduleAdjustmentsForProject(supabase, projectId, options = {}) {
  let query = supabase
    .from('schedule_adjustments')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (options.status) {
    if (Array.isArray(options.status)) {
      query = query.in('status', options.status);
    } else {
      query = query.eq('status', options.status);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} row
 */
export async function createScheduleAdjustment(supabase, row) {
  const { data, error } = await supabase
    .from('schedule_adjustments')
    .insert({
      ...row,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} id
 * @param {object} updates
 */
export async function updateScheduleAdjustment(supabase, id, updates) {
  const { data, error } = await supabase
    .from('schedule_adjustments')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Create a pending early-completion suggestion when a task finishes ahead of plan.
 * No-ops when workdays gained is 0 or a pending row already exists for the task.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   organizationId: string,
 *   projectId: string,
 *   task: object,
 *   userId?: string|null,
 *   workdaysGained?: number,
 *   actualFinish?: string|null,
 * }} args
 */
export async function maybeCreateEarlyCompletionAdjustment(supabase, args) {
  const {
    organizationId,
    projectId,
    task,
    userId = null,
    workdaysGained = 0,
    actualFinish = null,
  } = args || {};

  const days = Math.max(0, Math.trunc(Number(workdaysGained) || 0));
  if (!organizationId || !projectId || !task?.id || days < 2) return null;

  const { data: existing, error: existingError } = await supabase
    .from('schedule_adjustments')
    .select('id')
    .eq('project_id', projectId)
    .eq('source_task_id', task.id)
    .eq('status', 'pending')
    .limit(1);
  if (existingError) throw existingError;
  if (existing?.length) return existing[0];

  const actual =
    actualFinish ||
    (task.completed_at ? String(task.completed_at).slice(0, 10) : null) ||
    new Date().toISOString().slice(0, 10);

  return createScheduleAdjustment(supabase, {
    organization_id: organizationId,
    project_id: projectId,
    source_task_id: task.id,
    adjustment_type: 'early_completion',
    status: 'pending',
    planned_finish: args.plannedFinish || task.due_date || null,
    actual_finish: actual,
    suggested_workdays: days,
    note: task.text ? `Early finish: ${task.text}` : null,
    created_by_user_id: userId,
  });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} adjustmentId
 * @param {{ workdays: number, selectedTaskIds: string[], snapshots: object[] }} payload
 */
export async function applyScheduleAdjustmentRpc(supabase, adjustmentId, payload) {
  const { data, error } = await supabase.rpc('apply_schedule_adjustment', {
    p_adjustment_id: adjustmentId,
    p_workdays: payload.workdays,
    p_selected_task_ids: payload.selectedTaskIds || [],
    p_snapshots: payload.snapshots || [],
  });
  if (error) throw error;
  return data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} adjustmentId
 */
export async function undoScheduleAdjustmentRpc(supabase, adjustmentId) {
  const { data, error } = await supabase.rpc('undo_schedule_adjustment', {
    p_adjustment_id: adjustmentId,
  });
  if (error) throw error;
  return data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} adjustmentId
 */
export async function dismissScheduleAdjustment(supabase, adjustmentId) {
  return updateScheduleAdjustment(supabase, adjustmentId, {
    status: 'dismissed',
    dismissed_at: new Date().toISOString(),
  });
}
