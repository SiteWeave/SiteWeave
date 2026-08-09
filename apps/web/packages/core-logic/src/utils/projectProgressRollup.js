/**
 * Duration-weighted project % from phase rows (matches desktop app semantics).
 * Prefer stored phase.progress (DB task rollup or schedule); use schedule-derived % only when progress is null/undefined.
 * Project-level progress prefers all tasks via computeProjectProgressPercent (unassigned included).
 */

import { buildFederalHolidayMap, businessDaysBetween } from './usBusinessCalendar.js';
import { parseLocalDateOnly, localDateOnlyIso, addDaysToDateOnly } from './dateOnly.js';
import { calculatePhaseProgressFromTasks } from './projectPhasesUtils.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toLocalDate = parseLocalDateOnly;

const localTodayMidnight = (now = new Date()) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate());

const phaseDurationDays = (startDate, endDate) => {
  const start = toLocalDate(startDate);
  const end = toLocalDate(endDate);
  if (!start || !end) return 1;
  const diffDays = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
  return Math.max(1, diffDays);
};

const scheduleProgressPct = (startDate, endDate, today) => {
  const start = toLocalDate(startDate);
  const end = toLocalDate(endDate);
  if (!start || !end) return null;
  const todayMid = localTodayMidnight(today);
  if (todayMid < start) return 0;
  if (todayMid >= end) return 100;
  const totalDays = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
  if (totalDays <= 0) return 100;
  const elapsedDays = Math.floor((todayMid.getTime() - start.getTime()) / MS_PER_DAY);
  return Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)));
};

const attachFallbackPhaseDates = (phases, projectDueDate) => {
  if (!Array.isArray(phases) || phases.length === 0) return [];
  const hasAnyDate = phases.some((phase) => phase.start_date && phase.end_date);
  if (hasAnyDate) return phases;

  const start = localTodayMidnight();
  const due = toLocalDate(projectDueDate);
  const fallbackEnd = due && due > start
    ? due
    : new Date(start.getTime() + phases.length * MS_PER_DAY);
  const totalDays = Math.max(1, Math.floor((fallbackEnd.getTime() - start.getTime()) / MS_PER_DAY));

  return phases.map((phase, index) => {
    const rangeStartOffset = Math.floor((index * totalDays) / phases.length);
    const rangeEndOffset = Math.floor(((index + 1) * totalDays) / phases.length);
    const phaseStart = new Date(start.getTime() + rangeStartOffset * MS_PER_DAY);
    const phaseEnd = new Date(start.getTime() + Math.max(rangeStartOffset + 1, rangeEndOffset) * MS_PER_DAY);
    return {
      ...phase,
      start_date: phase.start_date || localDateOnlyIso(phaseStart),
      end_date: phase.end_date || localDateOnlyIso(phaseEnd),
    };
  });
};

/**
 * @param {Array<{ progress?: number|null, start_date?: string|null, end_date?: string|null, order?: number }>} phases - ordered phases for one project
 * @param {string|null|undefined} projectDueDate
 * @returns {number} 0–100
 */
export function computeWeightedProjectProgressPercent(phases, projectDueDate) {
  if (!phases || phases.length === 0) return 0;

  const sorted = [...phases].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const normalizedPhases = attachFallbackPhaseDates(sorted, projectDueDate);
  const today = new Date();

  const totalDuration = normalizedPhases.reduce(
    (sum, phase) => sum + phaseDurationDays(phase.start_date, phase.end_date),
    0
  );
  if (totalDuration <= 0) return 0;

  const weighted = normalizedPhases.reduce((sum, phase) => {
    const duration = phaseDurationDays(phase.start_date, phase.end_date);
    const derivedProgress = scheduleProgressPct(phase.start_date, phase.end_date, today);
    const hasExplicitProgress = phase.progress !== null && phase.progress !== undefined;
    const progress = hasExplicitProgress
      ? Math.max(0, Math.min(100, phase.progress || 0))
      : (typeof derivedProgress === 'number' ? derivedProgress : 0);
    return sum + (progress * duration) / totalDuration;
  }, 0);

  return Math.round(weighted);
}

/**
 * Project-level % for cards, lists, and summaries.
 *
 * Tasks are the source of truth for work done — including unassigned / no-phase tasks.
 * Phases only organize work; empty phases must not zero out real task progress.
 * When there are no tasks yet, fall back to duration-weighted phase.progress (schedule-only projects).
 *
 * @param {{
 *   tasks?: Array<{ completed?: boolean, percent_complete?: number|null }>,
 *   phases?: Array<{ progress?: number|null, start_date?: string|null, end_date?: string|null, order?: number }>,
 *   projectDueDate?: string|null,
 * }} args
 * @returns {number} 0–100
 */
export function computeProjectProgressPercent({ tasks = [], phases = [], projectDueDate = null } = {}) {
  if (Array.isArray(tasks) && tasks.length > 0) {
    return calculatePhaseProgressFromTasks(tasks);
  }
  if (Array.isArray(phases) && phases.length > 0) {
    return computeWeightedProjectProgressPercent(phases, projectDueDate);
  }
  return 0;
}

function taskEffectiveEndDateIso(task) {
  if (!task) return null;
  if (task.due_date) return task.due_date;
  if (!task.start_date) return null;
  const durationRaw = Number(task.duration_days);
  const n = Number.isFinite(durationRaw) ? Math.max(1, Math.trunc(durationRaw)) : 1;
  return addDaysToDateOnly(task.start_date, n - 1);
}

function collectTaskScheduleIsoDates(task) {
  const out = [];
  if (task?.start_date) out.push(task.start_date);
  if (task?.due_date) out.push(task.due_date);
  const eff = taskEffectiveEndDateIso(task);
  if (eff) out.push(eff);
  return out;
}

/**
 * When `projects.start_date` is missing, infer schedule window from task dates:
 * start = earliest date among task start/due/effective end; end = project due_date if set and valid, else latest task date.
 * @param {Array<{ start_date?: string|null, due_date?: string|null, duration_days?: number|null }>} tasks
 * @param {string|null|undefined} projectDueDate
 * @returns {{ start: string, end: string } | null}
 */
export function inferScheduleBoundsFromTasks(tasks, projectDueDate) {
  if (!tasks || tasks.length === 0) return null;
  const all = [];
  for (const t of tasks) {
    for (const d of collectTaskScheduleIsoDates(t)) {
      all.push(d);
    }
  }
  if (all.length === 0) return null;
  all.sort();
  const inferredStart = all[0];
  const latestAmongTasks = all[all.length - 1];
  const inferredEnd =
    typeof projectDueDate === 'string' &&
    projectDueDate.length > 0 &&
    projectDueDate >= inferredStart
      ? projectDueDate
      : latestAmongTasks;
  if (!inferredEnd || inferredEnd < inferredStart) return null;
  return { start: inferredStart, end: inferredEnd };
}

/**
 * Shared elapsed/total math for a [minStart, maxEnd] window (inclusive day indexing like phase timeline).
 */
function scheduleTimelineFromBounds(minStart, maxEnd, now) {
  const endExclusive = new Date(maxEnd.getTime() + MS_PER_DAY);
  const holidayMap = buildFederalHolidayMap(minStart, endExclusive);
  const totalDays = Math.max(1, businessDaysBetween(minStart, endExclusive, holidayMap));
  const today = localTodayMidnight(now);
  let elapsedDays = businessDaysBetween(minStart, today, holidayMap);
  elapsedDays = Math.max(0, Math.min(totalDays, elapsedDays));

  const schedule_progress_pct = Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)));

  return {
    schedule_day_current: elapsedDays,
    schedule_day_total: totalDays,
    schedule_progress_pct,
    schedule_start: localDateOnlyIso(minStart),
    schedule_end: localDateOnlyIso(maxEnd),
  };
}

/**
 * Calendar span for "day X of Y" in progress reports (pure time model).
 *
 * **Precedence:**
 * 1. **Project baseline:** `projects.start_date` → `projects.due_date` when both are set and valid (end ≥ start).
 * 2. **Task-inferred window:** when baseline is unavailable, earliest task schedule date → project due (if valid) or latest task date — see {@link inferScheduleBoundsFromTasks}.
 * 3. **Phases:** earliest phase start → latest phase end after {@link attachFallbackPhaseDates} (only if task inference unavailable).
 *
 * Position is always **today** (`now`) within that window — not task completion or work volume.
 *
 * @param {Array<{ progress?: number|null, start_date?: string|null, end_date?: string|null, order?: number }>} phases
 * @param {string|null|undefined} projectDueDate
 * @param {Date} [now]
 * @param {string|null|undefined} [projectStartDate] - `projects.start_date`; used with `projectDueDate` for the baseline window
 * @param {Array<{ start_date?: string|null, due_date?: string|null, duration_days?: number|null }>|null} [tasks] - project tasks for inferred window when project start is missing
 * @returns {{ schedule_day_current: number, schedule_day_total: number, schedule_progress_pct: number } | null}
 */
export function computeProjectScheduleTimeline(
  phases,
  projectDueDate,
  now = new Date(),
  projectStartDate = null,
  tasks = null,
) {
  const windowStart = toLocalDate(projectStartDate);
  const windowEnd = toLocalDate(projectDueDate);
  if (windowStart && windowEnd && windowEnd >= windowStart) {
    return scheduleTimelineFromBounds(windowStart, windowEnd, now);
  }

  const inferred = inferScheduleBoundsFromTasks(tasks, projectDueDate);
  if (inferred) {
    const s = toLocalDate(inferred.start);
    const e = toLocalDate(inferred.end);
    if (s && e && e >= s) {
      return scheduleTimelineFromBounds(s, e, now);
    }
  }

  if (!phases || phases.length === 0) return null;

  const sorted = [...phases].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const normalized = attachFallbackPhaseDates(sorted, projectDueDate);

  let minStart = null;
  let maxEnd = null;
  for (const p of normalized) {
    const s = toLocalDate(p.start_date);
    const e = toLocalDate(p.end_date);
    if (s && e) {
      if (!minStart || s < minStart) minStart = s;
      if (!maxEnd || e > maxEnd) maxEnd = e;
    }
  }
  if (!minStart || !maxEnd) return null;

  return scheduleTimelineFromBounds(minStart, maxEnd, now);
}

/**
 * Group phase rows from a batched query by project_id (sorted by order).
 * @param {Array<{ project_id: string, order?: number }>} rows
 * @returns {Record<string, Array>}
 */
export function groupPhasesByProjectId(rows) {
  const map = {};
  for (const row of rows || []) {
    const pid = row.project_id;
    if (!pid) continue;
    if (!map[pid]) map[pid] = [];
    map[pid].push(row);
  }
  for (const pid of Object.keys(map)) {
    map[pid].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  return map;
}
