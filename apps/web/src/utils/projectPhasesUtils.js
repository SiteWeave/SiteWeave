import {
  parseLocalDateOnly,
  addDaysToDateOnly,
  formatLocalDateRange,
  calculatePhaseProgressFromTasks,
} from '@siteweave/core-logic';

export { calculatePhaseProgressFromTasks };

/** Default phase template (order 1..n). */
export const DEFAULT_PHASE_TEMPLATE = [
    { name: 'Phase 1', progress: 0, start_date: null, end_date: null, order: 1 },
    { name: 'Phase 2', progress: 0, start_date: null, end_date: null, order: 2 },
    { name: 'Phase 3', progress: 0, start_date: null, end_date: null, order: 3 },
    { name: 'Phase 4', progress: 0, start_date: null, end_date: null, order: 4 },
];

/** @deprecated Use DEFAULT_PHASE_TEMPLATE */
export const DEFAULT_CONSTRUCTION_PHASES = DEFAULT_PHASE_TEMPLATE;

export const DEFAULT_PHASE_TEMPLATE_NAMES = DEFAULT_PHASE_TEMPLATE.map((p) => p.name);

/** @deprecated Use DEFAULT_PHASE_TEMPLATE_NAMES */
export const DEFAULT_CONSTRUCTION_PHASE_NAMES = DEFAULT_PHASE_TEMPLATE_NAMES;

function getTaskEndDateForRollup(task) {
    if (task?.due_date) return task.due_date;
    if (!task?.start_date) return null;
    const duration = Number.isFinite(Number(task.duration_days))
        ? Math.max(1, Number(task.duration_days))
        : 1;
    return addDaysToDateOnly(task.start_date, duration - 1);
}

/**
 * Derive phase schedule bounds from linked tasks (display + client-side preview).
 * @param {Array<{ start_date?: string|null, due_date?: string|null, duration_days?: number|null }>} taskList
 */
export function derivePhaseDatesFromTasks(taskList) {
    if (!taskList?.length) {
        return { start_date: null, end_date: null };
    }

    const starts = taskList.map((t) => t.start_date).filter(Boolean);
    const ends = taskList.map((t) => getTaskEndDateForRollup(t)).filter(Boolean);

    if (!starts.length && !ends.length) {
        return { start_date: null, end_date: null };
    }

    const start_date = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
    const end_date = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null;
    return { start_date, end_date };
}

/**
 * Format phase date range for UI headers (local calendar).
 * @param {string|null} start
 * @param {string|null} end
 * @param {string} [locale]
 */
export function formatPhaseDateRange(start, end, locale = undefined) {
    return formatLocalDateRange(start, end, locale);
}

/**
 * Weighted overall progress from phase rows (by schedule duration when dates exist).
 * @param {Array<{ progress?: number, start_date?: string|null, end_date?: string|null }>} phases
 */
export function calculateOverallPhaseProgress(phases) {
    if (!phases?.length) return 0;

    const msPerDay = 24 * 60 * 60 * 1000;
    const durations = phases.map((phase) => {
        const start = parseLocalDateOnly(phase.start_date);
        const end = parseLocalDateOnly(phase.end_date);
        if (!start || !end) return 1;
        return Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay));
    });
    const totalDuration = durations.reduce((sum, value) => sum + value, 0);
    if (totalDuration <= 0) return 0;
    const weighted = phases.reduce((sum, phase, index) => {
        const p = Math.max(0, Math.min(100, phase.progress ?? 0));
        return sum + (p * durations[index]) / totalDuration;
    }, 0);
    return Math.round(weighted);
}

/** localStorage key for phase section collapse */
export function phaseCollapseStorageKey(projectId, phaseKey) {
    return `siteweave.phaseCollapse.${projectId}.${phaseKey}`;
}

export function setAllPhaseSectionsExpanded(projectId, phaseKeys, expanded) {
    if (typeof window === 'undefined') return;
    const value = expanded ? '1' : '0';
    for (const key of phaseKeys) {
        try {
            window.localStorage.setItem(phaseCollapseStorageKey(projectId, phaseKey), value);
        } catch {
            /* ignore */
        }
    }
}
