/**
 * Lazy Data Loader
 * Functions to load non-critical data on-demand
 */

const LAD_DEBUG = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

function ladLog(...args) {
  if (LAD_DEBUG) console.log(...args);
}

function ladWarn(...args) {
  if (LAD_DEBUG) console.warn(...args);
}

/**
 * Task columns for list views + dashboard (excludes heavy deprecated workflow JSON).
 * Keep in sync with TaskItem, ProjectDetailsView, DashboardStats, and realtime payloads.
 */
export const TASK_LIST_SELECT = [
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

/** Single in-flight load so concurrent callers share one network round-trip */
let tasksLoadInFlight = null;

async function runTasksLoadWithRetries(supabaseClient, dispatch, getState) {
  const maxAttempts = 4;
  const baseDelayMs = 350;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const state = getState();
    if (!state || state.tasksLoaded) {
      if (state?.tasksLoaded) ladLog('Tasks already loaded, skipping');
      return;
    }

    if (attempt === 0) ladLog('📦 Lazy loading tasks...');
    const startTime = performance.now();

    try {
      const { data: tasks, error } = await supabaseClient.from('tasks').select(TASK_LIST_SELECT);

      if (error) throw error;

      const endTime = performance.now();
      ladLog(`✅ Tasks loaded in ${Math.round(endTime - startTime)}ms`);

      dispatch({ type: 'SET_TASKS_LOADED', payload: tasks || [] });
      return;
    } catch (error) {
      console.error('Error loading tasks:', error);
      const isLast = attempt === maxAttempts - 1;
      if (isLast) {
        ladWarn('Tasks load failed after retries; counts may stay at 0 until navigation or refresh.');
        return;
      }
      await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
    }
  }
}

/**
 * Load tasks if not already loaded
 * @param {Object} supabaseClient - Supabase client instance
 * @param {Function} dispatch - Redux-like dispatch function
 * @param {() => Object} getState - Returns current app state (avoids stale snapshot after awaits)
 */
export async function loadTasksIfNeeded(supabaseClient, dispatch, getState) {
  const snapshot = getState();
  if (!snapshot || snapshot.tasksLoaded) {
    if (snapshot?.tasksLoaded) ladLog('Tasks already loaded, skipping');
    return;
  }

  if (!tasksLoadInFlight) {
    tasksLoadInFlight = runTasksLoadWithRetries(supabaseClient, dispatch, getState).finally(() => {
      tasksLoadInFlight = null;
    });
  }

  await tasksLoadInFlight;
}

/**
 * Load files if not already loaded
 * @param {Object} supabaseClient - Supabase client instance
 * @param {Function} dispatch - Redux-like dispatch function
 * @param {() => Object} getState - Returns current app state
 */
export async function loadFilesIfNeeded(supabaseClient, dispatch, getState) {
  const state = getState();
  if (!state || state.filesLoaded) {
    if (state?.filesLoaded) ladLog('Files already loaded, skipping');
    return;
  }

  ladLog('📦 Lazy loading files...');
  const startTime = performance.now();

  try {
    const { data: files, error } = await supabaseClient.from('files').select('*');

    if (error) throw error;

    const endTime = performance.now();
    ladLog(`✅ Files loaded in ${Math.round(endTime - startTime)}ms`);

    dispatch({ type: 'SET_FILES_LOADED', payload: files || [] });
  } catch (error) {
    console.error('Error loading files:', error);
    dispatch({ type: 'SET_FILES_LOADED', payload: [] });
  }
}

/**
 * Load calendar events if not already loaded
 * @param {Object} supabaseClient - Supabase client instance
 * @param {Function} dispatch - Redux-like dispatch function
 * @param {() => Object} getState - Returns current app state
 */
export async function loadCalendarEventsIfNeeded(supabaseClient, dispatch, getState) {
  const state = getState();
  if (!state || state.calendarEventsLoaded) {
    if (state?.calendarEventsLoaded) ladLog('Calendar events already loaded, skipping');
    return;
  }

  ladLog('📦 Lazy loading calendar events...');
  const startTime = performance.now();

  try {
    const { data: calendarEvents, error } = await supabaseClient
      .from('calendar_events')
      .select('*')
      .order('start_time', { ascending: true });

    if (error) throw error;

    const endTime = performance.now();
    ladLog(`✅ Calendar events loaded in ${Math.round(endTime - startTime)}ms`);

    dispatch({ type: 'SET_CALENDAR_EVENTS_LOADED', payload: calendarEvents || [] });
  } catch (error) {
    console.error('Error loading calendar events:', error);
    dispatch({ type: 'SET_CALENDAR_EVENTS_LOADED', payload: [] });
  }
}

/**
 * Load tasks for a specific project (more efficient than loading all tasks)
 * @param {Object} supabaseClient - Supabase client instance
 * @param {Function} dispatch - Redux-like dispatch function
 * @param {string} projectId - Project ID to load tasks for
 * @param {() => Object} getState - Returns current app state
 */
export async function loadProjectTasks(supabaseClient, dispatch, projectId, getState) {
  ladLog(`📦 Loading tasks for project ${projectId}...`);
  const startTime = performance.now();

  try {
    const { data: tasks, error } = await supabaseClient
      .from('tasks')
      .select(TASK_LIST_SELECT)
      .eq('project_id', projectId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });

    if (error) throw error;

    const endTime = performance.now();
    ladLog(`✅ Project tasks loaded in ${Math.round(endTime - startTime)}ms`);

    const state = getState() || { tasks: [] };
    const otherTasks = (state.tasks || []).filter((t) => String(t.project_id) !== String(projectId));
    dispatch({ type: 'MERGE_TASKS', payload: [...otherTasks, ...(tasks || [])] });

    return tasks || [];
  } catch (error) {
    console.error('Error loading project tasks:', error);
    return [];
  }
}
