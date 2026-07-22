/**
 * Schedule pull-forward helpers for early task completion.
 * Successor-scoped (FS only); does not select unrelated parallel work.
 */

import { addBusinessDays, workdaysGainedBetween } from '../utils/usBusinessCalendar.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const iso = String(value).slice(0, 10);
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateString(value) {
  const d = parseDate(value);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addCalendarDays(dateString, days) {
  const d = parseDate(dateString);
  if (!d || !Number.isFinite(days)) return dateString || null;
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

function compareDateStrings(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function getTaskEndDate(task) {
  if (task?.due_date) return task.due_date;
  if (!task?.start_date) return null;
  const duration = Number.isFinite(Number(task.duration_days))
    ? Math.max(1, Number(task.duration_days))
    : 1;
  return addCalendarDays(task.start_date, duration - 1);
}

export function getTaskDurationDays(task) {
  if (Number.isFinite(Number(task?.duration_days)) && Number(task.duration_days) > 0) {
    return Math.max(1, Number(task.duration_days));
  }
  const start = task?.start_date;
  const end = getTaskEndDate(task);
  if (!start || !end) return 1;
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return 1;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / DAY_MS) + 1);
}

function completedFinishDate(task) {
  if (!task) return null;
  if (task.completed_at) return String(task.completed_at).slice(0, 10);
  if (task.completed) return getTaskEndDate(task);
  return null;
}

function buildOutgoingFsMap(dependencies) {
  const outgoing = new Map();
  (dependencies || []).forEach((dep) => {
    if ((dep.dependency_type || 'finish_to_start') !== 'finish_to_start') return;
    if (!outgoing.has(dep.task_id)) outgoing.set(dep.task_id, []);
    outgoing.get(dep.task_id).push(dep.successor_task_id);
  });
  return outgoing;
}

function buildIncomingFsMap(dependencies) {
  const incoming = new Map();
  (dependencies || []).forEach((dep) => {
    if ((dep.dependency_type || 'finish_to_start') !== 'finish_to_start') return;
    if (!incoming.has(dep.successor_task_id)) incoming.set(dep.successor_task_id, []);
    incoming.get(dep.successor_task_id).push(dep);
  });
  return incoming;
}

/**
 * Earliest allowed start for a successor given current task states.
 * Completed predecessors use actual finish (or planned end); open ones use planned end.
 */
export function getEarliestAllowedStartForPullForward(taskId, tasks, dependencies) {
  const taskMap = new Map((tasks || []).map((t) => [t.id, t]));
  const incoming = buildIncomingFsMap(dependencies);
  const predecessors = incoming.get(taskId) || [];
  let maxRequiredStart = null;

  predecessors.forEach((dep) => {
    const predecessor = taskMap.get(dep.task_id);
    if (!predecessor) return;
    const predecessorEnd = predecessor.completed
      ? completedFinishDate(predecessor) || getTaskEndDate(predecessor)
      : getTaskEndDate(predecessor);
    if (!predecessorEnd) return;
    const lagDays = Number.isFinite(Number(dep.lag_days)) ? Number(dep.lag_days) : 0;
    const requiredStart = addCalendarDays(predecessorEnd, lagDays + 1);
    if (!requiredStart) return;
    if (!maxRequiredStart || compareDateStrings(requiredStart, maxRequiredStart) > 0) {
      maxRequiredStart = requiredStart;
    }
  });

  return maxRequiredStart;
}

export function collectFsSuccessorIds(sourceTaskId, dependencies) {
  const outgoing = buildOutgoingFsMap(dependencies);
  const result = [];
  const queue = [sourceTaskId];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const nextIds = outgoing.get(current) || [];
    nextIds.forEach((id) => {
      if (!visited.has(id)) {
        result.push(id);
        queue.push(id);
      }
    });
  }
  return result;
}

/**
 * Suggest workdays gained from planned end vs actual finish.
 */
export function suggestWorkdaysGained(task, actualFinishIso = null) {
  const planned = getTaskEndDate(task);
  const actual =
    actualFinishIso ||
    (task?.completed_at ? String(task.completed_at).slice(0, 10) : null) ||
    toDateString(new Date());
  if (!planned || !actual) return 0;
  return workdaysGainedBetween(actual, planned);
}

/**
 * Build pull-forward preview for incomplete FS successors of a source task.
 */
export function buildPullForwardPreview({
  sourceTask,
  tasks = [],
  dependencies = [],
  workdaysGained,
  actualFinishDate = null,
}) {
  const days = Math.max(0, Math.trunc(Number(workdaysGained) || 0));
  const sourceId = sourceTask?.id;
  if (!sourceId || days < 1) {
    return {
      workdaysGained: days,
      candidates: [],
      excluded: [],
      projectFinishBefore: null,
      projectFinishAfter: null,
    };
  }

  const actual =
    actualFinishDate ||
    (sourceTask.completed_at ? String(sourceTask.completed_at).slice(0, 10) : null) ||
    toDateString(new Date());

  const taskMap = new Map((tasks || []).map((t) => [t.id, { ...t }]));
  // Treat source as completed with actual finish for earliest-start math.
  const sourceCopy = {
    ...sourceTask,
    completed: true,
    completed_at: actual,
    due_date: actual,
  };
  taskMap.set(sourceId, sourceCopy);

  const successorIds = collectFsSuccessorIds(sourceId, dependencies);
  const candidates = [];
  const excluded = [];

  successorIds.forEach((id) => {
    const task = taskMap.get(id);
    if (!task) return;
    if (task.completed || (Number(task.percent_complete ?? 0) || 0) >= 100) {
      excluded.push({ taskId: id, text: task.text, reason: 'completed' });
      return;
    }
    if (!task.start_date && !task.due_date) {
      excluded.push({ taskId: id, text: task.text, reason: 'no_dates' });
      return;
    }

    const beforeStart = task.start_date || null;
    const beforeDue = getTaskEndDate(task);
    const duration = getTaskDurationDays(task);

    let afterStart = beforeStart ? addBusinessDays(beforeStart, -days) : null;
    let afterDue = beforeDue ? addBusinessDays(beforeDue, -days) : null;

    const earliest = getEarliestAllowedStartForPullForward(id, Array.from(taskMap.values()), dependencies);
    if (earliest && afterStart && compareDateStrings(afterStart, earliest) < 0) {
      afterStart = earliest;
      afterDue = addCalendarDays(afterStart, duration - 1);
    }

    if (
      (!beforeStart || !afterStart || compareDateStrings(afterStart, beforeStart) >= 0) &&
      (!beforeDue || !afterDue || compareDateStrings(afterDue, beforeDue) >= 0)
    ) {
      excluded.push({
        taskId: id,
        text: task.text,
        reason: 'blocked_by_other_predecessors',
        earliestAllowedStart: earliest,
      });
      return;
    }

    // Update map so downstream successors see pulled dates.
    taskMap.set(id, {
      ...task,
      start_date: afterStart || task.start_date,
      due_date: afterDue || task.due_date,
    });

    candidates.push({
      taskId: id,
      text: task.text,
      selected: true,
      before_start: beforeStart,
      before_due: beforeDue,
      after_start: afterStart,
      after_due: afterDue,
      earliestAllowedStart: earliest,
    });
  });

  const maxEnd = (list) => {
    let max = null;
    list.forEach((t) => {
      const end = getTaskEndDate(t);
      if (end && (!max || end > max)) max = end;
    });
    return max;
  };

  const projectFinishBefore = maxEnd(tasks);
  const projectFinishAfter = maxEnd(Array.from(taskMap.values()));

  return {
    workdaysGained: days,
    actualFinishDate: actual,
    plannedFinishDate: getTaskEndDate(sourceTask),
    candidates,
    excluded,
    projectFinishBefore,
    projectFinishAfter,
  };
}

/**
 * True when pull-forward would move at least one incomplete FS successor.
 * Used to avoid banner / pending rows that cannot be applied.
 */
export function hasMovablePullForwardSuccessors(args) {
  const preview = buildPullForwardPreview(args || {});
  return (preview.candidates || []).length > 0;
}

export function snapshotsFromCandidates(candidates = []) {
  return (candidates || [])
    .filter((c) => c.selected !== false)
    .map((c) => ({
      task_id: c.taskId,
      before_start: c.before_start || null,
      before_due: c.before_due || null,
      after_start: c.after_start || null,
      after_due: c.after_due || null,
    }));
}

/**
 * Project end date for client-facing progress reports.
 * When keepOriginal is on and client_due_date is frozen, prefer that over live task ends.
 *
 * @param {{
 *   project?: { due_date?: string|null, client_due_date?: string|null }|null,
 *   tasks?: Array,
 *   keepOriginalCompletionDate?: boolean,
 * }} args
 * @returns {string|null}
 */
export function resolveReportProjectEndDate({
  project = null,
  tasks = [],
  keepOriginalCompletionDate = true,
} = {}) {
  if (keepOriginalCompletionDate && project?.client_due_date) {
    return project.client_due_date;
  }
  let max = null;
  for (const task of tasks || []) {
    const end = getTaskEndDate(task);
    if (end && (!max || end > max)) max = end;
  }
  return max || project?.due_date || null;
}

/**
 * Due date to use for schedule-timeline math on client reports.
 * @param {{ due_date?: string|null, client_due_date?: string|null }|null} project
 * @param {boolean} keepOriginalCompletionDate
 */
export function resolveReportScheduleDueDate(project, keepOriginalCompletionDate = true) {
  if (keepOriginalCompletionDate && project?.client_due_date) {
    return project.client_due_date;
  }
  return project?.due_date ?? null;
}
