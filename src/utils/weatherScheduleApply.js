import { updateWeatherImpact } from '@siteweave/core-logic';
import {
  applyScheduleImpact,
  suggestDownstreamScheduleImpactSelection,
  getTaskEndDate,
} from './taskDependencyService';
import { logWeatherImpactScheduleApplied } from './activityLogger';

function maxScheduleEndAmongTasks(tasks) {
  let max = null;
  for (const task of tasks || []) {
    const end = getTaskEndDate(task);
    if (end && (!max || end > max)) max = end;
  }
  return max;
}

async function syncProjectDueDateFromTasks(supabase, project, dispatch) {
  const { data: postTasks } = await supabase
    .from('tasks')
    .select('due_date, start_date, duration_days')
    .eq('project_id', project.id);
  const latestEnd = maxScheduleEndAmongTasks(postTasks || []);
  const nextDue = latestEnd || null;
  if (project.due_date !== nextDue) {
    const { error } = await supabase
      .from('projects')
      .update({ due_date: nextDue })
      .eq('id', project.id);
    if (error) throw error;
    dispatch?.({
      type: 'UPDATE_PROJECT',
      payload: { ...project, due_date: nextDue },
    });
  }
}

/**
 * Apply a logged weather impact to the project schedule (tasks + phases).
 * @returns {{ taskCount: number, phaseCount: number, alreadyApplied?: boolean }}
 */
export async function applyScheduleToWeatherImpact({
  supabase,
  impact,
  project,
  allTasks,
  projectPhases,
  taskDependencies,
  projectDependencyMode,
  user,
  orgId,
  dispatch,
}) {
  if (!impact || impact.schedule_shift_applied === true) {
    return { taskCount: 0, phaseCount: 0, alreadyApplied: true };
  }

  const startDate = impact.start_date;
  const endDate = impact.end_date || impact.start_date;
  const daysLost = Number(impact.days_lost || 1);

  if (!startDate) {
    const err = new Error('WEATHER_DATES_REQUIRED');
    throw err;
  }

  const selection = suggestDownstreamScheduleImpactSelection({
    tasks: allTasks,
    phases: projectPhases,
    startDate,
    endDate: endDate || startDate,
  });
  const selectedTaskIds = selection.selectedTaskIds || [];
  const selectedPhaseIds = selection.selectedPhaseIds || [];

  if (selectedTaskIds.length === 0 && selectedPhaseIds.length === 0) {
    const err = new Error('WEATHER_NO_SCHEDULED_ITEMS');
    throw err;
  }

  const { directTaskUpdates, directPhaseUpdates } = applyScheduleImpact({
    tasks: allTasks,
    dependencies: taskDependencies,
    phases: projectPhases,
    selectedTaskIds,
    selectedPhaseIds,
    daysLost,
    cascade: false,
    dependencyMode: projectDependencyMode,
  });

  const taskUpdateResults = await Promise.all(
    directTaskUpdates.map(async (update) => {
      const payload = {};
      if (update.start_date !== undefined) payload.start_date = update.start_date;
      if (update.due_date !== undefined) payload.due_date = update.due_date;
      if (Object.keys(payload).length === 0) return null;
      const { error } = await supabase.from('tasks').update(payload).eq('id', update.taskId);
      return error || null;
    }),
  );
  const firstTaskError = taskUpdateResults.find(Boolean);
  if (firstTaskError) throw firstTaskError;

  const phaseUpdateResults = await Promise.all(
    directPhaseUpdates.map(async (update) => {
      const payload = {};
      if (update.start_date !== undefined) payload.start_date = update.start_date;
      if (update.end_date !== undefined) payload.end_date = update.end_date;
      if (Object.keys(payload).length === 0) return null;
      const { error } = await supabase.from('project_phases').update(payload).eq('id', update.phaseId);
      return error || null;
    }),
  );
  const firstPhaseError = phaseUpdateResults.find(Boolean);
  if (firstPhaseError) throw firstPhaseError;

  await syncProjectDueDateFromTasks(supabase, project, dispatch);

  const nowIso = new Date().toISOString();
  const updated = await updateWeatherImpact(supabase, impact.id, {
    schedule_shift_applied: true,
    applied_at: nowIso,
    affected_task_ids: selectedTaskIds,
    affected_phase_ids: selectedPhaseIds,
  });

  const taskCount = directTaskUpdates.length;
  const phaseCount = directPhaseUpdates.length;

  if (taskCount > 0 || phaseCount > 0) {
    await logWeatherImpactScheduleApplied(
      { ...updated, schedule_shift_applied: true },
      user,
      project.id,
      orgId,
      {
        tasks_direct: taskCount,
        tasks_cascade: 0,
        phases: phaseCount,
      },
    );
  }

  return { taskCount, phaseCount };
}
