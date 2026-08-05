/**
 * Tasks Service
 * Handles all task-related database operations
 */

/** List columns for dashboards, mobile home, lazy loader — keep in sync with TaskItem / TaskCard. */
export const TASK_LIST_COLUMNS = [
  'id',
  'project_id',
  'organization_id',
  'text',
  'due_date',
  'priority',
  'completed',
  'assignee_id',
  'recurrence',
  'parent_task_id',
  'is_recurring_instance',
  'start_date',
  'duration_days',
  'is_milestone',
  'created_at',
  'project_phase_id',
  'percent_complete',
  'notify_assignee_email',
  'completed_at',
  'contacts!fk_tasks_assignee_id(name, avatar_url, email, phone)',
  'task_photos(id)',
].join(',');

/**
 * Fetch all tasks
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @returns {Promise<Array>} Array of tasks
 */
export async function fetchTasks(supabase) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

/**
 * Resolve auth.uid() to the user's contact_id from profiles.
 * tasks.assignee_id stores contacts.id, NOT auth.users.id.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - Auth user ID (auth.uid())
 * @returns {Promise<string|null>} The user's contact_id, or null
 */
async function resolveUserContactId(supabase, userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('contact_id')
    .eq('id', userId)
    .single();
  return profile?.contact_id || null;
}

/**
 * Fetch tasks assigned to a specific user
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - Auth user ID (auth.uid()) — will be resolved to contact_id
 * @param {string} [contactId] - Optional pre-resolved contact_id (skips lookup if provided)
 * @returns {Promise<Array>} Array of tasks
 */
export async function fetchUserTasks(supabase, userId, contactId) {
  const resolvedContactId = contactId || await resolveUserContactId(supabase, userId);
  if (!resolvedContactId) return [];
  
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_LIST_COLUMNS)
    .eq('assignee_id', resolvedContactId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

/**
 * Fetch incomplete tasks assigned to a user
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - Auth user ID (auth.uid()) — will be resolved to contact_id
 * @param {string} [contactId] - Optional pre-resolved contact_id (skips lookup if provided)
 * @param {{ limit?: number, orderByDueDate?: boolean }} [options]
 * @returns {Promise<Array>} Array of incomplete tasks
 */
export async function fetchUserIncompleteTasks(supabase, userId, contactId, options = {}) {
  const resolvedContactId = contactId || await resolveUserContactId(supabase, userId);
  if (!resolvedContactId) return [];

  let query = supabase
    .from('tasks')
    .select(TASK_LIST_COLUMNS)
    .eq('assignee_id', resolvedContactId)
    .eq('completed', false);

  if (options.orderByDueDate) {
    query = query
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  if (options.limit != null) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Columns allowed on task insert — tasks table has no created_by_user_id or description. */
const TASK_INSERT_FIELDS = [
  'project_id',
  'organization_id',
  'text',
  'due_date',
  'priority',
  'completed',
  'assignee_id',
  'recurrence',
  'parent_task_id',
  'is_recurring_instance',
  'start_date',
  'duration_days',
  'is_milestone',
  'percent_complete',
  'project_phase_id',
  'notify_assignee_email',
];

function pickTaskInsertPayload(taskData) {
  if (!taskData || typeof taskData !== 'object') return {};
  return TASK_INSERT_FIELDS.reduce((acc, key) => {
    if (taskData[key] !== undefined) acc[key] = taskData[key];
    return acc;
  }, {});
}

const ACTIVITY_TRACKED_TASK_FIELDS = [
  'text',
  'assignee_id',
  'due_date',
  'start_date',
  'priority',
  'duration_days',
  'project_phase_id',
];

async function recordTaskActivity(supabase, params) {
  try {
    const { recordActivity } = await import('./activityService.js');
    await recordActivity(supabase, params);
  } catch (err) {
    console.warn('[activity] task activity failed:', err);
  }
}

/**
 * Create a new task
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Object} taskData - Task data
 * @returns {Promise<Object>} Created task
 */
export async function createTask(supabase, taskData) {
  const payload = pickTaskInsertPayload(taskData);
  const normalized = normalizeTaskProgressUpdate(payload);
  if (normalized.completed) {
    normalized.completed_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from('tasks')
    .insert(normalized)
    .select()
    .single();
  
  if (error) throw error;

  await recordTaskActivity(supabase, {
    action: 'created',
    entityType: 'task',
    entityId: data.id,
    entityName: data.text || 'Task',
    projectId: data.project_id || null,
    organizationId: data.organization_id || null,
    details: {
      priority: data.priority || null,
      due_date: data.due_date || null,
      assignee_id: data.assignee_id || null,
    },
  });

  if (data.completed) {
    await recordTaskActivity(supabase, {
      action: 'completed',
      entityType: 'task',
      entityId: data.id,
      entityName: data.text || 'Task',
      projectId: data.project_id || null,
      organizationId: data.organization_id || null,
    });
  }

  return data;
}

/**
 * Normalize percent_complete and completed so they stay in sync (0–100).
 * @param {Object} updates - Partial task updates
 * @returns {Object}
 */
export function normalizeTaskProgressUpdate(updates) {
  const next = { ...updates };
  if (
    next.percent_complete !== undefined &&
    next.percent_complete !== null &&
    next.percent_complete !== ''
  ) {
    const parsed = Number(next.percent_complete);
    const bounded = Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
    next.percent_complete = bounded;
    next.completed = bounded >= 100;
  } else if (next.completed !== undefined) {
    next.percent_complete = next.completed ? 100 : 0;
  }
  return next;
}

/**
 * Set or clear completed_at when completion status changes.
 * @param {Object} updates - Normalized partial task updates
 * @param {{ completed?: boolean } | null | undefined} currentTask
 * @returns {Object}
 */
export function applyCompletedAtUpdate(updates, currentTask) {
  if (updates.completed === undefined) return updates;

  const wasCompleted = Boolean(currentTask?.completed);
  const willBeCompleted = Boolean(updates.completed);
  if (willBeCompleted && !wasCompleted) {
    return { ...updates, completed_at: new Date().toISOString() };
  }
  if (!willBeCompleted && wasCompleted) {
    return { ...updates, completed_at: null };
  }
  return updates;
}

/**
 * Update a task
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} taskId - Task ID
 * @param {Object} updates - Task updates
 * @returns {Promise<Object>} Updated task
 */
export async function updateTask(supabase, taskId, updates) {
  const normalized = normalizeTaskProgressUpdate(updates);
  const affectsCompletion =
    normalized.completed !== undefined || normalized.percent_complete !== undefined;
  const trackedKeysPresent = ACTIVITY_TRACKED_TASK_FIELDS.some((key) =>
    Object.prototype.hasOwnProperty.call(normalized, key),
  );

  let payload = normalized;
  let previous = null;
  if (affectsCompletion || trackedKeysPresent) {
    const { data: current, error: currentError } = await supabase
      .from('tasks')
      .select(
        'id, text, completed, project_id, organization_id, assignee_id, due_date, start_date, priority, duration_days, project_phase_id',
      )
      .eq('id', taskId)
      .maybeSingle();
    if (currentError) throw currentError;
    previous = current;
    if (affectsCompletion) {
      payload = applyCompletedAtUpdate(normalized, current);
    }
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', taskId)
    .select();
  
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Task not found or update failed');
  }

  const updatedRow = data[0];
  const previousCompleted = Boolean(previous?.completed);
  const nowCompleted = Boolean(updatedRow.completed);
  const becameComplete = affectsCompletion && nowCompleted && !previousCompleted;
  const becameIncomplete = affectsCompletion && !nowCompleted && previousCompleted;

  if (becameComplete) {
    await recordTaskActivity(supabase, {
      action: 'completed',
      entityType: 'task',
      entityId: updatedRow.id,
      entityName: updatedRow.text || 'Task',
      projectId: updatedRow.project_id || null,
      organizationId: updatedRow.organization_id || null,
    });
  } else if (becameIncomplete) {
    await recordTaskActivity(supabase, {
      action: 'uncompleted',
      entityType: 'task',
      entityId: updatedRow.id,
      entityName: updatedRow.text || 'Task',
      projectId: updatedRow.project_id || null,
      organizationId: updatedRow.organization_id || null,
    });
  }

  if (previous && trackedKeysPresent) {
    const changes = {};
    for (const key of ACTIVITY_TRACKED_TASK_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(normalized, key)) continue;
      const before = previous[key] ?? null;
      const after = updatedRow[key] ?? null;
      if (before !== after) changes[key] = after;
    }
    // Don't emit a redundant "updated" when the only transition was complete/uncomplete.
    if (Object.keys(changes).length > 0) {
      await recordTaskActivity(supabase, {
        action: 'updated',
        entityType: 'task',
        entityId: updatedRow.id,
        entityName: updatedRow.text || previous.text || 'Task',
        projectId: updatedRow.project_id || null,
        organizationId: updatedRow.organization_id || null,
        details: { changes },
      });
    }
  }

  return updatedRow;
}

/**
 * Mark a task as complete
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} taskId - Task ID
 * @returns {Promise<Object>} Updated task
 */
export async function completeTask(supabase, taskId) {
  const { data: current, error: currentError } = await supabase
    .from('tasks')
    .select('id, text, project_id, organization_id, start_date, due_date, duration_days, completed, completed_at')
    .eq('id', taskId)
    .maybeSingle();
  if (currentError) throw currentError;

  const updated = await updateTask(supabase, taskId, { percent_complete: 100, completed: true });

  try {
    const { suggestWorkdaysGained, getTaskEndDate } = await import('../utils/schedulePullForward.js');
    const { maybeCreateEarlyCompletionAdjustment } = await import('./scheduleAdjustmentsService.js');
    const completedTask = { ...(current || {}), ...updated, completed: true };
    const days = suggestWorkdaysGained(completedTask);
    let organizationId = completedTask.organization_id || null;
    if (!organizationId && completedTask.project_id) {
      const { data: projectRow } = await supabase
        .from('projects')
        .select('organization_id')
        .eq('id', completedTask.project_id)
        .maybeSingle();
      organizationId = projectRow?.organization_id || null;
    }
    if (days > 0 && completedTask.project_id && organizationId) {
      await maybeCreateEarlyCompletionAdjustment(supabase, {
        organizationId,
        projectId: completedTask.project_id,
        task: completedTask,
        plannedFinish: getTaskEndDate(completedTask),
        workdaysGained: days,
        actualFinish: completedTask.completed_at
          ? String(completedTask.completed_at).slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      });
    }
  } catch (suggestError) {
    console.error('Schedule gain suggestion after completeTask failed:', suggestError);
  }

  return updated;
}

/**
 * Delete a task
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} taskId - Task ID
 * @returns {Promise<void>}
 */
export async function deleteTask(supabase, taskId) {
  const { data: existing } = await supabase
    .from('tasks')
    .select('id, text, project_id, organization_id')
    .eq('id', taskId)
    .maybeSingle();

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);
  
  if (error) throw error;

  if (existing) {
    await recordTaskActivity(supabase, {
      action: 'deleted',
      entityType: 'task',
      entityId: existing.id,
      entityName: existing.text || 'Task',
      projectId: existing.project_id || null,
      organizationId: existing.organization_id || null,
    });
  }
}

function scopedProjectIds(projectIds) {
  if (projectIds == null) return null;
  if (!Array.isArray(projectIds)) return null;
  return projectIds.filter(Boolean);
}

/**
 * Fetch completed tasks count for a user
 * Uses RLS policies to automatically filter tasks based on user role
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - User ID (not used but kept for API consistency)
 * @param {{ projectIds?: string[] | null }} [options] - When set, limit to these projects (empty = 0)
 * @returns {Promise<number>} Count of completed tasks
 */
export async function fetchCompletedTasksCount(supabase, userId, options = {}) {
  const projectIds = scopedProjectIds(options.projectIds);
  if (projectIds && projectIds.length === 0) return 0;

  let query = supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('completed', true);

  if (projectIds?.length) {
    query = query.in('project_id', projectIds);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

/**
 * Fetch overdue tasks count for a user
 * Uses RLS policies to automatically filter tasks based on user role
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - User ID (not used but kept for API consistency)
 * @param {{ projectIds?: string[] | null }} [options] - When set, limit to these projects (empty = 0)
 * @returns {Promise<number>} Count of overdue incomplete tasks
 */
export async function fetchOverdueTasksCount(supabase, userId, options = {}) {
  const projectIds = scopedProjectIds(options.projectIds);
  if (projectIds && projectIds.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  let query = supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('completed', false)
    .lt('due_date', todayStr);

  if (projectIds?.length) {
    query = query.in('project_id', projectIds);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

/**
 * Fetch overdue incomplete tasks for dashboard modals (RLS-scoped).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ limit?: number, projectIds?: string[] | null }} [options]
 */
export async function fetchOverdueTasksList(supabase, options = {}) {
  const { limit = 100, projectIds: rawProjectIds } = options;
  const projectIds = scopedProjectIds(rawProjectIds);
  if (projectIds && projectIds.length === 0) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  let query = supabase
    .from('tasks')
    .select(TASK_LIST_COLUMNS)
    .eq('completed', false)
    .lt('due_date', todayStr)
    .order('due_date', { ascending: true })
    .limit(limit);

  if (projectIds?.length) {
    query = query.in('project_id', projectIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Group tasks by project for dashboard overdue/completed modals.
 * @param {Array<{ project_id?: string, text?: string }>} tasks
 * @param {Array<{ id: string, name?: string }>} projects
 * @param {{ noProjectLabel?: string }} [options]
 */
export function groupTasksByProject(tasks, projects, options = {}) {
  const noProjectLabel = options.noProjectLabel || 'No project';
  const projectById = new Map((projects || []).map((project) => [String(project.id), project]));
  const grouped = new Map();

  (tasks || []).forEach((task) => {
    const key = String(task.project_id || 'unassigned');
    const project = projectById.get(key);
    if (!grouped.has(key)) {
      grouped.set(key, {
        projectId: project?.id ?? (key === 'unassigned' ? null : key),
        projectName: project?.name || noProjectLabel,
        items: [],
      });
    }
    grouped.get(key).items.push(task);
  });

  return Array.from(grouped.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
}

/**
 * Fetch recently completed tasks for dashboard modals (RLS-scoped).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ limit?: number, projectIds?: string[] | null }} [options]
 */
export async function fetchCompletedTasksList(supabase, options = {}) {
  const { limit = 100, projectIds: rawProjectIds } = options;
  const projectIds = scopedProjectIds(rawProjectIds);
  if (projectIds && projectIds.length === 0) return [];

  let query = supabase
    .from('tasks')
    .select(TASK_LIST_COLUMNS)
    .eq('completed', true)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (projectIds?.length) {
    query = query.in('project_id', projectIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Fetch tasks for a specific project
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} projectId - Project ID
 * @returns {Promise<Array>} Array of tasks
 */
export async function fetchTasksByProject(supabase, projectId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}
