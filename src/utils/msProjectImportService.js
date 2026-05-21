/**
 * Persist schedule import: new project, replace schedule, or append schedule.
 */

import { parseMsProjectXml } from './msProjectXmlParser.js';
import { buildScheduleFromMappedRows, mergeWithSuggestedMappings } from './msProjectImportMapping.js';

const UNMAPPED_IMPORT_PHASE_UID = '__unmapped_import_phase__';
const UNMAPPED_IMPORT_PHASE_NAME = 'Imported Top-Level Tasks';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @param {string} params.xmlText
 * @param {string} params.organizationId
 * @param {string} params.userId
 * @param {Record<string, string>} [params.sourceFieldMappings] user overrides; merged with suggestions
 * @param {object} [params.rowRules]
 * @param {'replace'|'append'} params.mode
 * @param {string} [params.projectId] required when mode is replace or append
 * @param {string} [params.projectName] required for replace/append only if renaming — optional
 * @param {boolean} [params.createNewProject] if true, insert project then schedule
 * @param {string} [params.newProjectName]
 * @param {string} [params.newProjectAddress]
 * @param {string} [params.newProjectNumber]
 * @param {'full'|'compress_linear_fs0'} [params.dependencyStrategy]
 * @returns {Promise<{ success: boolean, projectId?: string, error?: string, warnings?: string[], metrics?: { importedTaskCount: number, importedDependencyCount: number, startDatedTaskCount: number, assignedTaskCount: number, reminderReadyTaskCount: number } }>}
 */
export async function importMsProjectXmlSchedule(supabase, params) {
    const {
        xmlText,
        organizationId,
        userId,
        sourceFieldMappings = {},
        rowRules = { strategy: 'summary_to_phase', skipOutlineLevel0: true, skipUid0: true },
        mode,
        projectId: existingProjectId,
        createNewProject,
        newProjectName,
        newProjectAddress,
        newProjectNumber,
        dependencyStrategy = 'full',
    } = params;

    const parsed = parseMsProjectXml(xmlText);
    if (parsed.error) {
        return { success: false, error: parsed.error };
    }

    const mappings = mergeWithSuggestedMappings(sourceFieldMappings);
    const built = buildScheduleFromMappedRows({
        rows: parsed.project.rows,
        sourceFieldMappings: mappings,
        rowRules,
        minutesPerDay: parsed.project.minutesPerDay,
        dependencyStrategy,
    });

    let projectId = existingProjectId;
    let createdProjectId = null;
    let replaceSnapshot = null;
    let replaceDeleted = false;
    let routedUnmappedTasksToFallbackPhase = false;

    try {
        if (createNewProject) {
            const { canCreateProject } = await import('@siteweave/core-logic');
            const allowed = await canCreateProject(supabase, organizationId);
            if (!allowed) return { success: false, error: 'PROJECT_LIMIT_REACHED' };

            const name = (newProjectName || parsed.project.title || 'Imported project').trim();
            const { data: proj, error: pErr } = await supabase
                .from('projects')
                .insert({
                    name,
                    address: newProjectAddress || null,
                    project_number: newProjectNumber || null,
                    status: 'Planning',
                    organization_id: organizationId,
                    created_by_user_id: userId,
                    project_manager_id: userId,
                    dependency_scheduling_mode: 'auto',
                })
                .select('id')
                .single();
            if (pErr) return { success: false, error: pErr.message };
            projectId = proj.id;
            createdProjectId = proj.id;

        }

        if (!projectId) {
            return { success: false, error: 'Missing project id' };
        }

        if (mode === 'replace') {
            replaceSnapshot = await loadExistingScheduleSnapshot(supabase, projectId);

            const { error: deleteTasksError } = await supabase.from('tasks').delete().eq('project_id', projectId);
            if (deleteTasksError) return { success: false, error: deleteTasksError.message };

            const { error: deletePhasesError } = await supabase.from('project_phases').delete().eq('project_id', projectId);
            if (deletePhasesError) return { success: false, error: deletePhasesError.message };

            replaceDeleted = true;
        }

        const phaseOrderStart = await getNextPhaseOrder(supabase, projectId, mode);

        const phaseRows = [...built.phases];
        const hasUnmappedTasks = built.tasks.some((t) => !t.parentPhaseSourceUid);
        if (hasUnmappedTasks && !phaseRows.some((p) => p.sourceUid === UNMAPPED_IMPORT_PHASE_UID)) {
            phaseRows.push({
                sourceUid: UNMAPPED_IMPORT_PHASE_UID,
                name: UNMAPPED_IMPORT_PHASE_NAME,
                start_date: null,
                end_date: null,
                progress: 0,
            });
            routedUnmappedTasksToFallbackPhase = true;
        }

        const phasePayload = phaseRows.map((p, i) => ({
            project_id: projectId,
            organization_id: organizationId,
            name: p.name,
            progress: p.progress ?? 0,
            budget: 0,
            order: phaseOrderStart + i,
            start_date: p.start_date,
            end_date: p.end_date,
        }));

        let phaseColumnFallbackWarning = null;
        /** @type {Record<string, string>} */
        let phaseSourceUidToId = {};
        if (phasePayload.length > 0) {
            const { data: insertedPhases, error: phErr } = await supabase.from('project_phases').insert(phasePayload).select('id');
            if (phErr) {
                const missingPhaseScheduleColumns =
                    String(phErr.message || '').includes('end_date') ||
                    String(phErr.message || '').includes('start_date');
                if (!missingPhaseScheduleColumns) {
                    return { success: false, error: phErr.message };
                }

                const fallbackPayload = phasePayload.map((phase) => ({
                    project_id: phase.project_id,
                    organization_id: phase.organization_id,
                    name: phase.name,
                    progress: phase.progress,
                    budget: phase.budget,
                    order: phase.order,
                }));
                const { data: fallbackInserted, error: fallbackErr } = await supabase
                    .from('project_phases')
                    .insert(fallbackPayload)
                    .select('id');
                if (fallbackErr) {
                    return { success: false, error: fallbackErr.message };
                }
                phaseColumnFallbackWarning =
                    'Phase start/end date columns are missing in this database. Imported phases were saved without phase dates. Run latest migrations to enable phase dates.';
                phaseRows.forEach((p, i) => {
                    if (fallbackInserted?.[i]?.id) {
                        phaseSourceUidToId[p.sourceUid] = fallbackInserted[i].id;
                    }
                });
            } else {
                phaseRows.forEach((p, i) => {
                    if (insertedPhases?.[i]?.id) {
                        phaseSourceUidToId[p.sourceUid] = insertedPhases[i].id;
                    }
                });
            }
        }

        const tasksPayload = built.tasks.map((t) => ({
            project_id: projectId,
            organization_id: organizationId,
            text: t.text,
            start_date: t.start_date,
            due_date: t.due_date,
            duration_days: t.duration_days,
            percent_complete: t.percent_complete,
            completed: t.completed,
            is_milestone: t.is_milestone ?? false,
            priority: t.priority || 'Medium',
            project_phase_id: phaseSourceUidToId[t.parentPhaseSourceUid || UNMAPPED_IMPORT_PHASE_UID] ?? null,
        }));

        if (tasksPayload.length === 0) {
            return {
                success: true,
                projectId,
                warnings: [...(built.warnings || []), 'No tasks were imported. Check mapping and row rules.'],
                metrics: {
                    importedTaskCount: 0,
                    importedDependencyCount: 0,
                    startDatedTaskCount: 0,
                    assignedTaskCount: 0,
                    reminderReadyTaskCount: 0,
                },
            };
        }

        const { data: insertedTasks, error: tErr } = await supabase.from('tasks').insert(tasksPayload).select('id');
        if (tErr) return { success: false, error: tErr.message };

        const uidToNewId = {};
        built.tasks.forEach((row, i) => {
            if (insertedTasks[i]) uidToNewId[row.sourceUid] = insertedTasks[i].id;
        });

        const depRows = [];
        for (const e of built.dependencyEdges) {
            const pred = uidToNewId[e.predUid];
            const succ = uidToNewId[e.succUid];
            if (pred && succ) {
                depRows.push({
                    task_id: pred,
                    successor_task_id: succ,
                    dependency_type: e.dependencyType,
                    lag_days: Math.round(e.lagDays) || 0,
                });
            }
        }

        if (depRows.length > 0) {
            const { error: dErr } = await supabase.from('task_dependencies').insert(depRows);
            if (dErr) return { success: false, error: dErr.message };
        }

        const startDatedTaskCount = built.tasks.filter((t) => Boolean(t.start_date)).length;
        const reminderReadyTaskCount = 0;

        return {
            success: true,
            projectId,
            warnings: [
                ...(built.warnings || []),
                ...(routedUnmappedTasksToFallbackPhase
                    ? [`Tasks without a detected phase were placed in "${UNMAPPED_IMPORT_PHASE_NAME}".`]
                    : []),
                ...(phaseColumnFallbackWarning ? [phaseColumnFallbackWarning] : []),
            ],
            metrics: {
                importedTaskCount: insertedTasks?.length || 0,
                importedDependencyCount: depRows.length,
                startDatedTaskCount,
                assignedTaskCount: 0,
                reminderReadyTaskCount,
            },
        };
    } catch (e) {
        let rollbackError = null;
        if (mode === 'replace' && replaceDeleted && replaceSnapshot) {
            rollbackError = await restoreScheduleSnapshot(supabase, replaceSnapshot);
        }
        if (createNewProject && createdProjectId) {
            await supabase.from('projects').delete().eq('id', createdProjectId);
        }
        console.error('importMsProjectXmlSchedule', e);
        const message = e.message || 'Import failed';
        if (rollbackError) {
            return { success: false, error: `${message}. Automatic rollback also failed: ${rollbackError}` };
        }
        return { success: false, error: message };
    }
}

async function getNextPhaseOrder(supabase, projectId, mode) {
    if (mode === 'replace') return 1;
    const { data } = await supabase
        .from('project_phases')
        .select('order')
        .eq('project_id', projectId)
        .order('order', { ascending: false })
        .limit(1);
    const max = data?.[0]?.order;
    return Number.isFinite(max) ? max + 1 : 1;
}

/**
 * Load org import templates for UI.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 */
export async function fetchScheduleImportTemplates(supabase, organizationId) {
    const { data, error } = await supabase
        .from('schedule_import_templates')
        .select('id, name, source_type, config, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
    if (error) return { templates: [], error: error.message };
    return { templates: data || [] };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} row
 */
export async function saveScheduleImportTemplate(supabase, row) {
    const { data, error } = await supabase
        .from('schedule_import_templates')
        .insert(row)
        .select('id')
        .single();
    if (error) return { success: false, error: error.message };
    return { success: true, id: data.id };
}

async function loadExistingScheduleSnapshot(supabase, projectId) {
    const { data: phases, error: phasesError } = await supabase
        .from('project_phases')
        .select('*')
        .eq('project_id', projectId)
        .order('order', { ascending: true });
    if (phasesError) {
        throw new Error(phasesError.message);
    }

    const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
    if (tasksError) {
        throw new Error(tasksError.message);
    }

    const taskIds = (tasks || []).map((task) => task.id);
    let dependencies = [];
    if (taskIds.length > 0) {
        const { data: deps, error: depsError } = await supabase
            .from('task_dependencies')
            .select('*')
            .in('task_id', taskIds);
        if (depsError) {
            throw new Error(depsError.message);
        }
        dependencies = deps || [];
    }

    return {
        projectId,
        phases: phases || [],
        tasks: tasks || [],
        dependencies,
    };
}

async function restoreScheduleSnapshot(supabase, snapshot) {
    const { projectId, phases, tasks, dependencies } = snapshot;

    const { error: clearTasksError } = await supabase.from('tasks').delete().eq('project_id', projectId);
    if (clearTasksError) return clearTasksError.message;

    const { error: clearPhasesError } = await supabase.from('project_phases').delete().eq('project_id', projectId);
    if (clearPhasesError) return clearPhasesError.message;

    if (phases.length > 0) {
        const { error: phaseError } = await supabase.from('project_phases').insert(phases);
        if (phaseError) return phaseError.message;
    }

    if (tasks.length > 0) {
        const { error: taskError } = await supabase.from('tasks').insert(tasks);
        if (taskError) return taskError.message;
    }

    if (dependencies.length > 0) {
        const { error: depError } = await supabase.from('task_dependencies').insert(dependencies);
        if (depError) return depError.message;
    }

    return null;
}
