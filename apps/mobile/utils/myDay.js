/**
 * My Day relevance helpers for the mobile home screen.
 * My Day should surface what matters today — not the full overdue backlog.
 */

export function startOfLocalDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseTaskDueDateLocal(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return null;
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Days from due date to today: positive = overdue, 0 = due today, negative = future.
 */
export function daysFromDueToToday(dueDate, today = new Date()) {
  const due = parseTaskDueDateLocal(dueDate);
  if (!due) return null;
  const start = startOfLocalDay(today);
  return Math.round((start.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Include tasks due today or recently overdue (not weeks-old backlog).
 * @param {Object} task
 * @param {Date} [today]
 * @param {{ maxOverdueDays?: number }} [options]
 */
export function isTaskRelevantForMyDay(task, today = new Date(), { maxOverdueDays = 7 } = {}) {
  if (!task || task.completed) return false;
  const offset = daysFromDueToToday(task.due_date, today);
  if (offset == null) return false;
  if (offset === 0) return true;
  if (offset > 0 && offset <= maxOverdueDays) return true;
  return false;
}

export function getTaskMyDayPriorityScore(task, today = new Date()) {
  let score = 0;
  const offset = daysFromDueToToday(task.due_date, today);

  if (offset === 0) {
    score += 1000;
  } else if (offset != null && offset > 0) {
    // Recent overdue ranks above due-today-adjacent; fresher overdue beats stale.
    score += 800 - Math.min(offset, 30);
  }

  switch (String(task.priority || '').toLowerCase()) {
    case 'high':
      score += 100;
      break;
    case 'medium':
      score += 50;
      break;
    case 'low':
      score += 10;
      break;
    default:
      break;
  }

  return score;
}

export function getEventMyDayPriorityScore(event, now = new Date()) {
  const start = event?.start_time ? new Date(event.start_time) : null;
  if (!start || Number.isNaN(start.getTime())) return 0;
  const msUntil = start.getTime() - now.getTime();
  // Sooner events rank higher; events in the next 2 hours get a boost.
  if (msUntil >= 0 && msUntil < 2 * 60 * 60 * 1000) {
    return 3000 - msUntil / 1000;
  }
  return 2000 - Math.min(Math.max(msUntil, 0), 12 * 60 * 60 * 1000) / 1000;
}

export function compareMyDayItems(a, b, now = new Date()) {
  const rank = (item) =>
    item.type === 'event'
      ? getEventMyDayPriorityScore(item, now)
      : item.priorityScore ?? getTaskMyDayPriorityScore(item, now);
  return rank(b) - rank(a);
}

export function buildMyDayItems({ tasks = [], events = [], today = new Date(), limit = 3, maxOverdueDays = 7 } = {}) {
  const now = new Date();

  const dayTasks = tasks
    .filter((task) => isTaskRelevantForMyDay(task, today, { maxOverdueDays }))
    .map((task) => ({
      ...task,
      type: 'task',
      priorityScore: getTaskMyDayPriorityScore(task, today),
    }));

  const dayEvents = events.map((event) => ({
    ...event,
    type: 'event',
    priorityScore: getEventMyDayPriorityScore(event, now),
  }));

  return [...dayTasks, ...dayEvents].sort((a, b) => compareMyDayItems(a, b, now)).slice(0, limit);
}
