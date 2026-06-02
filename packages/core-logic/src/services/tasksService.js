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

/**
 * Create a new task
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Object} taskData - Task data
 * @returns {Promise<Object>} Created task
 */
export async function createTask(supabase, taskData) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()
    .single();
  
  if (error) throw error;
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
 * Update a task
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} taskId - Task ID
 * @param {Object} updates - Task updates
 * @returns {Promise<Object>} Updated task
 */
export async function updateTask(supabase, taskId, updates) {
  const normalized = normalizeTaskProgressUpdate(updates);
  const { data, error } = await supabase
    .from('tasks')
    .update(normalized)
    .eq('id', taskId)
    .select();
  
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Task not found or update failed');
  }
  return data[0];
}

/**
 * Mark a task as complete
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} taskId - Task ID
 * @returns {Promise<Object>} Updated task
 */
export async function completeTask(supabase, taskId) {
  return updateTask(supabase, taskId, { percent_complete: 100, completed: true });
}

/**
 * Delete a task
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} taskId - Task ID
 * @returns {Promise<void>}
 */
export async function deleteTask(supabase, taskId) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);
  
  if (error) throw error;
}

/**
 * Fetch completed tasks count for a user
 * Uses RLS policies to automatically filter tasks based on user role
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - User ID (not used but kept for API consistency)
 * @returns {Promise<number>} Count of completed tasks
 */
export async function fetchCompletedTasksCount(supabase, userId) {
  const { count, error } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('completed', true);
  
  if (error) throw error;
  return count || 0;
}

/**
 * Fetch overdue tasks count for a user
 * Uses RLS policies to automatically filter tasks based on user role
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - User ID (not used but kept for API consistency)
 * @returns {Promise<number>} Count of overdue incomplete tasks
 */
export async function fetchOverdueTasksCount(supabase, userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  
  const { count, error } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('completed', false)
    .lt('due_date', todayStr);
  
  if (error) throw error;
  return count || 0;
}

/**
 * Fetch overdue incomplete tasks for dashboard modals (RLS-scoped).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} [limit]
 */
export async function fetchOverdueTasksList(supabase, limit = 100) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_LIST_COLUMNS)
    .eq('completed', false)
    .lt('due_date', todayStr)
    .order('due_date', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Fetch recently completed tasks for dashboard modals (RLS-scoped).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} [limit]
 */
export async function fetchCompletedTasksList(supabase, limit = 100) {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_LIST_COLUMNS)
    .eq('completed', true)
    .order('updated_at', { ascending: false })
    .limit(limit);

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
