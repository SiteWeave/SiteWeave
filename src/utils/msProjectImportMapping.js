import { computeDurationDays } from './msProjectXmlParser.js';

/**
 * SiteWeave targets for user mapping (magic setup).
 */
export const SW_TARGET = {
    ROW_NAME: 'row.name',
    TASK_START: 'task.start_date',
    TASK_DUE: 'task.due_date',
    TASK_DURATION: 'task.duration_days',
    TASK_PERCENT: 'task.percent_complete',
    TASK_MILESTONE: 'task.is_milestone',
    TASK_PREDECESSORS: 'task.predecessor_links',
    ROW_SUMMARY: 'row.summary',
    IGNORE: 'ignore',
};

/** @typedef {'summary_to_phase' | 'all_tasks'} RowRuleStrategy */

/**
 * Default suggestions for typical Microsoft Project XML (user can override).
 */
export const DEFAULT_MS_PROJECT_SUGGESTIONS = {
    'el:Name': SW_TARGET.ROW_NAME,
    'el:Start': SW_TARGET.TASK_START,
    'el:Finish': SW_TARGET.TASK_DUE,
    'el:Duration': SW_TARGET.TASK_DURATION,
    'el:PercentComplete': SW_TARGET.TASK_PERCENT,
    'el:Milestone': SW_TARGET.TASK_MILESTONE,
    'meta:predecessor_links': SW_TARGET.TASK_PREDECESSORS,
    'el:Summary': SW_TARGET.ROW_SUMMARY,
};

/**
 * Merge user mappings with defaults for keys still unset.
 * @param {Record<string, string>} userMap sourceFieldKey -> swTarget
 * @returns {Record<string, string>}
 */
export function mergeWithSuggestedMappings(userMap = {}) {
    const out = { ...DEFAULT_MS_PROJECT_SUGGESTIONS };
    for (const [k, v] of Object.entries(userMap)) {
        if (v === '' || v == null) {
            delete out[k];
        } else {
            out[k] = v;
        }
    }
    return out;
}

/**
 * Build merged field lookup for a row (element fields + extended).
 * @param {{ fields: Record<string, string>, extended: Map<string, string> }} row
 * @returns {Record<string, string>}
 */
function rowFieldLookup(row) {
    const o = { ...row.fields };
    row.extended.forEach((val, key) => {
        o[key] = val;
    });
    return o;
}

/**
 * Resolve mapped value for a target from row using sourceFieldMappings (reverse: target -> first matching key).
 * @param {Record<string, string>} lookup
 * @param {Record<string, string>} sourceFieldMappings key -> SW_TARGET
 * @param {string} target
 * @returns {string | undefined}
 */
function valueForTarget(lookup, sourceFieldMappings, target) {
    for (const [srcKey, tgt] of Object.entries(sourceFieldMappings)) {
        if (tgt === target && lookup[srcKey] != null && lookup[srcKey] !== '') {
            return lookup[srcKey];
        }
    }
    return undefined;
}

function hasTargetMapping(sourceFieldMappings, target) {
    return Object.values(sourceFieldMappings).includes(target);
}

/**
 * @param {string} raw
 */
function parseIntPercent(raw) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, n));
}

/**
 * @param {string} raw
 */
function parseBool(raw) {
    return raw === '1' || raw === 'true' || raw === 'True';
}

/**
 * Apply mappings and row rules to produce phase rows and task rows for import.
 * @param {{
 *   rows: Array<object>,
 *   sourceFieldMappings: Record<string, string>,
 *   rowRules: { strategy: RowRuleStrategy, skipOutlineLevel0?: boolean, skipUid0?: boolean },
 *   minutesPerDay?: number,
 * }} opts
 */
export function buildScheduleFromMappedRows(opts) {
    const { rows, sourceFieldMappings, rowRules } = opts;
    const minutesPerDay = opts.minutesPerDay || 480;
    const strategy = rowRules?.strategy || 'summary_to_phase';
    const skipOutlineLevel0 = rowRules?.skipOutlineLevel0 !== false;
    const skipUid0 = rowRules?.skipUid0 !== false;
    const hasPredecessorMapping = hasTargetMapping(sourceFieldMappings, SW_TARGET.TASK_PREDECESSORS);
    const dependencyStrategy = opts.dependencyStrategy || 'full';

    const warnings = [];
    const phases = [];
    const tasks = [];
    /** @type {Array<{ predUid: string, succUid: string, dependencyType: string, lagDays: number }>} */
    const dependencyEdges = [];

    const uidToTaskUid = new Set();

    /** @type {{ uid: string, level: number }[]} */
    const phaseStack = [];

    const outlineLevelNum = (lookup) => {
        const o = lookup['el:OutlineLevel'];
        if (o == null || o === '') return 1;
        const n = parseInt(String(o), 10);
        return Number.isFinite(n) ? Math.max(1, n) : 1;
    };

    // Pre-scan: detect a single "project container" summary that wraps all real phases.
    // This happens when MS Project's "Show Project Summary Task" option is on — the project
    // name appears as the sole OutlineLevel=1 summary and all actual phases sit at OutlineLevel=2+.
    // If exactly ONE summary exists at the minimum outline level we skip it as a phase
    // (it's the project-level wrapper, not a real phase) while still using it in the
    // phaseStack so that child phases resolve to the correct parent.
    let projectContainerUid = null;
    if (strategy === 'summary_to_phase') {
        const summaryEntries = [];
        for (const row of rows) {
            const lookup = rowFieldLookup(row);
            const uid = lookup['el:UID'] || row.uid;
            if (skipUid0 && uid === '0') continue;
            const outlineLevel = lookup['el:OutlineLevel'];
            if (skipOutlineLevel0 && outlineLevel === '0') continue;
            const summaryRaw = valueForTarget(lookup, sourceFieldMappings, SW_TARGET.ROW_SUMMARY);
            if (summaryRaw === '1' || summaryRaw === 'true') {
                const level = parseInt(outlineLevel || '1', 10);
                const nameRaw = valueForTarget(lookup, sourceFieldMappings, SW_TARGET.ROW_NAME) || '';
                summaryEntries.push({ uid, level, name: nameRaw.trim() });
            }
        }
        if (summaryEntries.length >= 2) {
            const minLevel = Math.min(...summaryEntries.map((s) => s.level));
            const atMinLevel = summaryEntries.filter((s) => s.level === minLevel);
            if (atMinLevel.length === 1) {
                // Sole summary at the shallowest level — this is the project-level container.
                projectContainerUid = atMinLevel[0].uid;
                warnings.push({
                    key: 'ms_import.warn_project_container',
                    params: { name: atMinLevel[0].name },
                });
            }
        }
    }

    for (const row of rows) {
        const lookup = rowFieldLookup(row);
        const outlineLevel = lookup['el:OutlineLevel'];
        const uid = lookup['el:UID'] || row.uid;

        if (skipUid0 && uid === '0') continue;
        if (skipOutlineLevel0 && outlineLevel === '0') continue;

        const nameRaw = valueForTarget(lookup, sourceFieldMappings, SW_TARGET.ROW_NAME) || '';
        const name = nameRaw.trim() || '(Untitled)';

        const summaryRaw = valueForTarget(lookup, sourceFieldMappings, SW_TARGET.ROW_SUMMARY);
        const isSummary = summaryRaw === '1' || summaryRaw === 'true';

        const startRaw = valueForTarget(lookup, sourceFieldMappings, SW_TARGET.TASK_START);
        const finishRaw = valueForTarget(lookup, sourceFieldMappings, SW_TARGET.TASK_DUE);
        const durRaw = valueForTarget(lookup, sourceFieldMappings, SW_TARGET.TASK_DURATION);
        const pctRaw = valueForTarget(lookup, sourceFieldMappings, SW_TARGET.TASK_PERCENT);
        const mileRaw = valueForTarget(lookup, sourceFieldMappings, SW_TARGET.TASK_MILESTONE);

        const startDate = startRaw ? toDateOnlyInline(startRaw) : null;
        const dueDate = finishRaw ? toDateOnlyInline(finishRaw) : null;

        let durationDays = null;
        if (durRaw) {
            const t = durRaw.trim();
            if (/^\d+(\.\d+)?$/.test(t)) {
                durationDays = Math.max(1, Math.round(parseFloat(t, 10)));
            } else if (t.startsWith('PT')) {
                durationDays = computeDurationDays(t, startRaw || '', finishRaw || '', minutesPerDay);
            }
        }
        if (durationDays == null && durRaw === '__computed' && lookup['__computed:duration_days']) {
            const c = lookup['__computed:duration_days'];
            if (/^\d+(\.\d+)?$/.test(c)) {
                durationDays = Math.max(1, Math.round(parseFloat(c, 10)));
            }
        }

        const pct = pctRaw != null ? parseIntPercent(pctRaw) : null;
        const isMilestone = mileRaw != null ? parseBool(mileRaw) : false;

        let isPhase = false;
        let isTask = false;
        if (strategy === 'all_tasks') {
            isTask = true;
        } else {
            isPhase = isSummary;
            isTask = !isSummary;
        }

        const level = outlineLevelNum(lookup);
        while (phaseStack.length > 0 && phaseStack[phaseStack.length - 1].level >= level) {
            phaseStack.pop();
        }

        if (isPhase) {
            if (uid === projectContainerUid) {
                // Project-level container: excluded from phases[] and phaseStack.
                // By not pushing it, tasks won't accidentally reference it as a parent.
            } else {
                phaseStack.push({ uid, level });
                phases.push({
                    sourceUid: uid,
                    name,
                    start_date: startDate,
                    end_date: dueDate,
                    progress: pct != null ? pct : 0,
                });
            }
        } else if (isTask) {
            uidToTaskUid.add(uid);
            // Use the top of the phaseStack — the container is never pushed, so this is
            // always a real phase uid (or null if no phase has been seen yet).
            const parentPhaseSourceUid = phaseStack.length > 0 ? phaseStack[phaseStack.length - 1].uid : null;
            let taskText = name;
            if (pct != null && pct > 0 && pct < 100) {
                taskText = `${name} [Imported at ${pct}% complete]`;
            }
            const completed = pct != null ? pct >= 100 : false;
            const percentComplete = completed ? 100 : 0;
            tasks.push({
                sourceUid: uid,
                text: taskText,
                start_date: startDate,
                due_date: dueDate,
                duration_days: durationDays,
                percent_complete: percentComplete,
                completed,
                is_milestone: isMilestone,
                priority: 'Medium',
                parentPhaseSourceUid,
            });
        }

        if (hasPredecessorMapping) {
            for (const pl of row.predecessorLinks) {
                const depType = mapMsLinkTypeToDependency(pl.type);
                const lagDays = mapLinkLagToDays(pl.linkLag, pl.lagFormat);
                dependencyEdges.push({
                    predUid: pl.predecessorUid,
                    succUid: uid,
                    dependencyType: depType,
                    lagDays,
                });
            }
        }
    }

    if (!hasPredecessorMapping && rows.some((row) => row.predecessorLinks?.length > 0)) {
        warnings.push('ms_import.warn_predecessors_unmapped');
    }

    const filteredDeps = dependencyEdges.filter(
        (e) => uidToTaskUid.has(e.succUid) && uidToTaskUid.has(e.predUid)
    );

    const finalDependencyEdges =
        dependencyStrategy === 'compress_linear_fs0'
            ? compressLinearFinishToStartEdges(filteredDeps, warnings)
            : filteredDeps;

    return { phases, tasks, dependencyEdges: finalDependencyEdges, warnings };
}

export function getImportBlockingIssues(sourceFieldMappings, rowRules) {
    const issues = [];
    if (!hasTargetMapping(sourceFieldMappings, SW_TARGET.ROW_NAME)) {
        issues.push('ms_import.issue_map_row_name');
    }
    if ((rowRules?.strategy || 'summary_to_phase') === 'summary_to_phase' &&
        !hasTargetMapping(sourceFieldMappings, SW_TARGET.ROW_SUMMARY)) {
        issues.push('ms_import.issue_map_summary_row');
    }
    return issues;
}

export function getImportWarnings(sourceFieldMappings) {
    const warnings = [];
    const hasAnyScheduleDate =
        hasTargetMapping(sourceFieldMappings, SW_TARGET.TASK_START) ||
        hasTargetMapping(sourceFieldMappings, SW_TARGET.TASK_DUE) ||
        hasTargetMapping(sourceFieldMappings, SW_TARGET.TASK_DURATION);
    if (!hasAnyScheduleDate) {
        warnings.push('ms_import.warn_no_schedule_dates');
    }
    if (!hasTargetMapping(sourceFieldMappings, SW_TARGET.TASK_PERCENT)) {
        warnings.push('ms_import.warn_no_percent');
    }
    return warnings;
}

function toDateOnlyInline(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

/**
 * Optional future optimization mode: keeps non-redundant deps while compressing
 * simple linear FS+0 chains where each task has exactly one predecessor and one successor.
 * This mode is intentionally opt-in and disabled by default.
 *
 * @param {Array<{ predUid: string, succUid: string, dependencyType: string, lagDays: number }>} edges
 * @param {string[]} warnings
 */
function compressLinearFinishToStartEdges(edges, warnings) {
    const isSimpleFs0 = (e) => e.dependencyType === 'finish_to_start' && (Math.round(e.lagDays) || 0) === 0;
    const predCount = new Map();
    const succCount = new Map();
    edges.forEach((e) => {
        predCount.set(e.succUid, (predCount.get(e.succUid) || 0) + 1);
        succCount.set(e.predUid, (succCount.get(e.predUid) || 0) + 1);
    });

    let compressedCount = 0;
    const kept = edges.filter((e) => {
        if (!isSimpleFs0(e)) return true;
        const succHasSinglePred = (predCount.get(e.succUid) || 0) === 1;
        const predHasSingleSucc = (succCount.get(e.predUid) || 0) === 1;
        // Only compress strict interior chain links; preserve branch/merge nodes.
        const shouldCompress = succHasSinglePred && predHasSingleSucc;
        if (shouldCompress) compressedCount += 1;
        return !shouldCompress;
    });

    if (compressedCount > 0) {
        warnings.push({
            key: 'ms_import.warn_dependency_compression',
            params: { count: compressedCount },
        });
    }
    return kept;
}

/**
 * MS Project link type: 0 FF, 1 FS, 2 SS, 3 SF
 * @param {string} type
 */
function mapMsLinkTypeToDependency(type) {
    const t = parseInt(type, 10);
    switch (t) {
        case 0:
            return 'finish_to_finish';
        case 2:
            return 'start_to_start';
        case 3:
            return 'start_to_finish';
        case 1:
        default:
            return 'finish_to_start';
    }
}

/**
 * LinkLag is often in tenths of minutes; LagFormat 7 = days (per MS XML). Simplified: treat as days when small integer else 0.
 * @param {string} linkLag
 * @param {string} lagFormat
 */
function mapLinkLagToDays(linkLag, lagFormat) {
    const lag = parseInt(linkLag, 10);
    if (!Number.isFinite(lag)) return 0;
    const fmt = parseInt(lagFormat, 10);
    if (fmt === 7) {
        return lag;
    }
    if (fmt === 5) {
        return lag / 4800;
    }
    return lag === 0 ? 0 : lag / 4800;
}
