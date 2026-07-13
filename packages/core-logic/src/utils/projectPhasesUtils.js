/**
 * Phase progress derived from linked tasks (average percent_complete; completed = 100).
 * @param {Array<{ completed?: boolean, percent_complete?: number|null }>} taskList
 * @returns {number} 0–100
 */
export function calculatePhaseProgressFromTasks(taskList) {
  if (!taskList?.length) return 0;
  const sum = taskList.reduce((acc, task) => {
    const pct = task.completed
      ? 100
      : Math.max(0, Math.min(100, Number(task.percent_complete ?? 0) || 0));
    return acc + pct;
  }, 0);
  return Math.round(sum / taskList.length);
}

/**
 * Build phase rows with task-derived progress when tasks exist.
 * @param {Array<{ id: string, progress?: number|null, [key: string]: unknown }>} phases
 * @param {Array<{ project_phase_id?: string|null, completed?: boolean, percent_complete?: number|null }>} tasks
 */
export function buildPhasesWithDerivedProgress(phases, tasks) {
  if (!phases?.length) return [];

  const tasksByPhaseId = new Map();
  for (const task of tasks || []) {
    const phaseId = task.project_phase_id;
    if (!phaseId) continue;
    if (!tasksByPhaseId.has(phaseId)) tasksByPhaseId.set(phaseId, []);
    tasksByPhaseId.get(phaseId).push(task);
  }

  return phases.map((phase) => {
    const phaseTasks = tasksByPhaseId.get(phase.id) || [];
    const progress =
      phaseTasks.length > 0
        ? calculatePhaseProgressFromTasks(phaseTasks)
        : Math.max(0, Math.min(100, Number(phase.progress ?? 0) || 0));
    return { ...phase, progress, tasks: phaseTasks };
  });
}

/**
 * Group tasks by phase id for rendering.
 * @returns {{ tasksByPhaseId: Map<string, Array>, unassignedTasks: Array }}
 */
export function groupTasksByPhaseId(phases, tasks) {
  const phaseIds = new Set((phases || []).map((phase) => phase.id));
  const tasksByPhaseId = new Map();
  const unassignedTasks = [];

  for (const task of tasks || []) {
    const phaseId = task.project_phase_id;
    if (!phaseId || !phaseIds.has(phaseId)) {
      unassignedTasks.push(task);
      continue;
    }
    if (!tasksByPhaseId.has(phaseId)) tasksByPhaseId.set(phaseId, []);
    tasksByPhaseId.get(phaseId).push(task);
  }

  return { tasksByPhaseId, unassignedTasks };
}
