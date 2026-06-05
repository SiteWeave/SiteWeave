/** Default construction schedule template (order 1..n). */
export const DEFAULT_CONSTRUCTION_PHASES = [
    { name: 'Mobilize', progress: 0, start_date: null, end_date: null, order: 1 },
    { name: 'Clear and Grub', progress: 0, start_date: null, end_date: null, order: 2 },
    { name: 'Demo', progress: 0, start_date: null, end_date: null, order: 3 },
    { name: 'Rough Cut', progress: 0, start_date: null, end_date: null, order: 4 },
    { name: 'BP', progress: 0, start_date: null, end_date: null, order: 5 },
    { name: 'Final Grade', progress: 0, start_date: null, end_date: null, order: 6 },
];

export const DEFAULT_CONSTRUCTION_PHASE_NAMES = DEFAULT_CONSTRUCTION_PHASES.map((p) => p.name);

/**
 * Weighted overall progress from phase rows (by schedule duration when dates exist).
 * @param {Array<{ progress?: number, start_date?: string|null, end_date?: string|null }>} phases
 */
export function calculateOverallPhaseProgress(phases) {
    if (!phases?.length) return 0;

    const parseDate = (dateString) => {
        if (!dateString) return null;
        const parsed = new Date(`${dateString}T00:00:00Z`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const msPerDay = 24 * 60 * 60 * 1000;
    const durations = phases.map((phase) => {
        const start = parseDate(phase.start_date);
        const end = parseDate(phase.end_date);
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
            window.localStorage.setItem(phaseCollapseStorageKey(projectId, key), value);
        } catch {
            /* ignore */
        }
    }
}
