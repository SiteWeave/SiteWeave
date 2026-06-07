/**
 * Lazy Data Loader
 * Functions to load non-critical data on-demand
 */

import {
  TASK_LIST_COLUMNS,
  fetchCalendarEvents,
  getCalendarLoadRange,
  isDateInCalendarLoadRange,
} from '@siteweave/core-logic';

/** Columns for file list views — avoid select('*'). */
export const FILE_LIST_COLUMNS = [
  'id',
  'project_id',
  'organization_id',
  'name',
  'type',
  'file_url',
  'modified_at',
  'size_kb',
].join(',');

/** Tracks the date window currently loaded into calendar state. */
let calendarLoadedRange = null;

const LAD_DEBUG = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

function ladLog(...args) {
  if (LAD_DEBUG) console.log(...args);
}

function ladWarn(...args) {
  if (LAD_DEBUG) console.warn(...args);
}

/** @deprecated use TASK_LIST_COLUMNS from @siteweave/core-logic */
export const TASK_LIST_SELECT = TASK_LIST_COLUMNS;

/** Single in-flight load so concurrent callers share one network round-trip */
let tasksLoadInFlight = null;
let myDayTasksLoadInFlight = null;

async function runTasksLoadWithRetries(supabaseClient, dispatch, getState) {
  const state = getState();
  if (!state || state.tasksLoaded) {
    if (state?.tasksLoaded) ladLog('Tasks already loaded, skipping');
    return;
  }
  // Org-wide task preload removed — project views load tasks on demand.
  dispatch({ type: 'SET_TASKS_LOADED', payload: state.tasks || [] });
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
 * Prefetch incomplete tasks assigned to the signed-in user for My Day sidebar.
 * Merges into global task state without replacing project-loaded tasks.
 */
export async function loadMyDayTasksIfNeeded(supabaseClient, dispatch, getState) {
  const state = getState();
  if (!state?.user?.id || state.myDayTasksLoaded) {
    return;
  }
  if (!state.userContactId) {
    return;
  }

  if (!myDayTasksLoadInFlight) {
    myDayTasksLoadInFlight = (async () => {
      try {
        const liveState = getState();
        if (!liveState?.user?.id || !liveState.userContactId) return;

        const { fetchUserIncompleteTasks } = await import('@siteweave/core-logic');
        const rows = await fetchUserIncompleteTasks(
          supabaseClient,
          liveState.user.id,
          liveState.userContactId,
          { limit: 50, orderByDueDate: true },
        );
        const existing = liveState.tasks || [];
        const byId = new Map(existing.map((t) => [String(t.id), t]));
        (rows || []).forEach((t) => {
          byId.set(String(t.id), { ...byId.get(String(t.id)), ...t });
        });
        dispatch({ type: 'MERGE_TASKS', payload: [...byId.values()] });
        dispatch({ type: 'SET_MY_DAY_TASKS_LOADED', payload: true });
      } catch (error) {
        console.error('Error loading My Day tasks:', error);
      }
    })().finally(() => {
      myDayTasksLoadInFlight = null;
    });
  }

  await myDayTasksLoadInFlight;
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
    const orgId = state.currentOrganization?.id;
    let query = supabaseClient.from('files').select(FILE_LIST_COLUMNS);
    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data: files, error } = await query;

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
 * Load calendar events for a reference date (3-month window).
 * Refetches when the reference date moves outside the currently loaded window.
 * @param {Object} supabaseClient - Supabase client instance
 * @param {Function} dispatch - Redux-like dispatch function
 * @param {() => Object} getState - Returns current app state
 * @param {Date} [referenceDate]
 */
export async function loadCalendarEventsIfNeeded(
  supabaseClient,
  dispatch,
  getState,
  referenceDate = new Date(),
) {
  const state = getState();
  if (!state) return;

  if (calendarLoadedRange && isDateInCalendarLoadRange(referenceDate, calendarLoadedRange)) {
    ladLog('Calendar events already loaded for this window, skipping');
    return;
  }

  ladLog('📦 Lazy loading calendar events...');
  const startTime = performance.now();

  try {
    const calendarEvents = await fetchCalendarEvents(supabaseClient, referenceDate);
    calendarLoadedRange = getCalendarLoadRange(referenceDate);

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
      .select(TASK_LIST_COLUMNS)
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
