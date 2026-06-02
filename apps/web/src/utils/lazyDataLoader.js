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

/** @deprecated use TASK_LIST_COLUMNS from @siteweave/core-logic */
export const TASK_LIST_SELECT = TASK_LIST_COLUMNS;

/** Single in-flight load so concurrent callers share one network round-trip */
let tasksLoadInFlight = null;

async function runTasksLoadWithRetries(supabaseClient, dispatch, getState) {
  const state = getState();
  if (!state || state.tasksLoaded) {
    if (state?.tasksLoaded) ladLog('Tasks already loaded, skipping');
    return;
  }
  dispatch({ type: 'SET_TASKS_LOADED', payload: state.tasks || [] });
}

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

export async function loadFilesIfNeeded(supabaseClient, dispatch, getState) {
  const state = getState();
  if (!state || state.filesLoaded) {
    if (state?.filesLoaded) ladLog('Files already loaded, skipping');
    return;
  }

  ladLog('Lazy loading files...');
  try {
    const orgId = state.currentOrganization?.id;
    let query = supabaseClient.from('files').select(FILE_LIST_COLUMNS);
    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    const { data: files, error } = await query;
    if (error) throw error;
    dispatch({ type: 'SET_FILES_LOADED', payload: files || [] });
  } catch (error) {
    console.error('Error loading files:', error);
    dispatch({ type: 'SET_FILES_LOADED', payload: [] });
  }
}

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

  try {
    const calendarEvents = await fetchCalendarEvents(supabaseClient, referenceDate);
    calendarLoadedRange = getCalendarLoadRange(referenceDate);
    dispatch({ type: 'SET_CALENDAR_EVENTS_LOADED', payload: calendarEvents || [] });
  } catch (error) {
    console.error('Error loading calendar events:', error);
    dispatch({ type: 'SET_CALENDAR_EVENTS_LOADED', payload: [] });
  }
}

export async function loadProjectTasks(supabaseClient, dispatch, projectId, getState) {
  try {
    const { data: tasks, error } = await supabaseClient
      .from('tasks')
      .select(TASK_LIST_COLUMNS)
      .eq('project_id', projectId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });

    if (error) throw error;

    const state = getState() || { tasks: [] };
    const otherTasks = (state.tasks || []).filter((t) => String(t.project_id) !== String(projectId));
    dispatch({ type: 'MERGE_TASKS', payload: [...otherTasks, ...(tasks || [])] });

    return tasks || [];
  } catch (error) {
    console.error('Error loading project tasks:', error);
    return [];
  }
}
