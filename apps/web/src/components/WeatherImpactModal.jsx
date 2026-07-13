import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import {
    createWeatherImpact,
    deleteWeatherImpact,
    inclusiveBusinessDaysLost,
    listWeatherImpactsForProject,
    updateWeatherImpact,
} from '@siteweave/core-logic';
import DateRangePicker from './DateRangePicker';
import {
    applyScheduleImpact,
    suggestDownstreamScheduleImpactSelection,
    getTaskEndDate,
} from '../utils/taskDependencyService';
import { logWeatherImpactRecorded, logWeatherImpactScheduleApplied } from '../utils/activityLogger';
import { applyScheduleToWeatherImpact } from '../utils/weatherScheduleApply';
import LoadingSpinner from './LoadingSpinner';
import { addDaysIso, localDateIso } from '../utils/dateHelpers';

/**
 * Modal: log weather / schedule impact, optionally shift task & phase dates (uniform downstream shift; no FS cascade).
 */
function maxScheduleEndAmongTasks(tasks) {
    let max = null;
    for (const t of tasks || []) {
        const e = getTaskEndDate(t);
        if (e && (!max || e > max)) max = e;
    }
    return max;
}

function WeatherImpactModal({
    project,
    allTasks,
    projectPhases,
    taskDependencies,
    projectDependencyMode,
    initialImpact = null,
    onClose,
    onApplied,
}) {
    const { t } = useTranslation();
    const { state, dispatch } = useAppContext();
    const { addToast } = useToast();
    const user = state.user;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [applyingImpactId, setApplyingImpactId] = useState(null);
    const [impacts, setImpacts] = useState([]);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [applyScheduleShift, setApplyScheduleShift] = useState(false);
    const [editingImpactId, setEditingImpactId] = useState(initialImpact?.id || null);

    const orgId = project?.organization_id;

    const loadImpacts = useCallback(async () => {
        if (!project?.id) return;
        setLoading(true);
        try {
            const rows = await listWeatherImpactsForProject(supabaseClient, project.id, orgId);
            setImpacts(rows);
        } catch (e) {
            console.error(e);
            addToast(e.message || t('weather.load_failed'), 'error');
        } finally {
            setLoading(false);
        }
    }, [project?.id, orgId, addToast]);

    useEffect(() => {
        loadImpacts();
    }, [loadImpacts]);

    useEffect(() => {
        setEditingImpactId(initialImpact?.id || null);
    }, [initialImpact?.id]);

    const editingImpact = useMemo(
        () => impacts.find((impact) => impact.id === editingImpactId) || null,
        [impacts, editingImpactId]
    );

    useEffect(() => {
        if (!editingImpact) return;
        setTitle(editingImpact.title || '');
        setDescription(editingImpact.description || '');
        setStartDate(editingImpact.start_date || '');
        setEndDate(editingImpact.end_date || '');
        setApplyScheduleShift(false);
    }, [editingImpact]);

    const suggestedSelection = useMemo(
        () =>
            suggestDownstreamScheduleImpactSelection({
                tasks: allTasks,
                phases: projectPhases,
                startDate,
                endDate,
            }),
        [allTasks, projectPhases, startDate, endDate]
    );

    const computedDaysLost = useMemo(() => {
        if (!startDate || !endDate) return 1;
        return inclusiveBusinessDaysLost(startDate, endDate);
    }, [startDate, endDate]);

    const preview = useMemo(() => {
        const dl = computedDaysLost;
        const { directTaskUpdates, directPhaseUpdates } = applyScheduleImpact({
            tasks: allTasks,
            dependencies: taskDependencies,
            phases: projectPhases,
            selectedTaskIds: suggestedSelection.selectedTaskIds,
            selectedPhaseIds: suggestedSelection.selectedPhaseIds,
            daysLost: dl,
            cascade: false,
            dependencyMode: projectDependencyMode,
        });
        const taskById = new Map(allTasks.map((task) => [task.id, task]));
        const phaseById = new Map(projectPhases.map((phase) => [phase.id, phase]));
        const previewRows = [
            ...directTaskUpdates.slice(0, 3).map((row) => ({
                id: row.taskId,
                label: taskById.get(row.taskId)?.text || t('weather.task_label'),
                before: `${taskById.get(row.taskId)?.start_date || '—'} to ${taskById.get(row.taskId)?.due_date || '—'}`,
                after: `${row.start_date || taskById.get(row.taskId)?.start_date || '—'} to ${row.due_date || taskById.get(row.taskId)?.due_date || '—'}`,
            })),
            ...directPhaseUpdates.slice(0, 2).map((row) => ({
                id: row.phaseId,
                label: t('weather.phase_label', { name: phaseById.get(row.phaseId)?.name || t('weather.phase_fallback') }),
                before: `${phaseById.get(row.phaseId)?.start_date || '—'} to ${phaseById.get(row.phaseId)?.end_date || '—'}`,
                after: `${row.start_date || phaseById.get(row.phaseId)?.start_date || '—'} to ${row.end_date || phaseById.get(row.phaseId)?.end_date || '—'}`,
            })),
        ];
        return {
            directTasks: directTaskUpdates.length,
            directPhases: directPhaseUpdates.length,
            previewRows,
        };
    }, [
        allTasks,
        taskDependencies,
        projectPhases,
        suggestedSelection.selectedTaskIds,
        suggestedSelection.selectedPhaseIds,
        computedDaysLost,
        projectDependencyMode,
    ]);

    const datePresets = (
        <>
            <button
                type="button"
                onClick={() => {
                    const todayIso = localDateIso();
                    setStartDate(todayIso);
                    setEndDate(todayIso);
                }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
                {t('common.today')}
            </button>
            <button
                type="button"
                onClick={() => {
                    const todayIso = localDateIso();
                    setStartDate((s) => s || todayIso);
                    setEndDate(addDaysIso(todayIso, 7) || todayIso);
                }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
                {t('common.plus_one_week')}
            </button>
            <button
                type="button"
                onClick={() => {
                    const t = localDateIso();
                    setStartDate((s) => s || t);
                    setEndDate(addDaysIso(t, 14) || t);
                }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
                {t('common.plus_two_weeks')}
            </button>
        </>
    );

    const syncProjectDueDateFromTasks = useCallback(async () => {
        const { data: postTasks } = await supabaseClient
            .from('tasks')
            .select('due_date, start_date, duration_days')
            .eq('project_id', project.id);
        const latestEnd = maxScheduleEndAmongTasks(postTasks || []);
        const nextDue = latestEnd || null;
        if (project.due_date !== nextDue) {
            const { error: projErr } = await supabaseClient
                .from('projects')
                .update({ due_date: nextDue })
                .eq('id', project.id);
            if (projErr) throw projErr;
            dispatch({
                type: 'UPDATE_PROJECT',
                payload: { ...project, due_date: nextDue },
            });
        }
    }, [dispatch, project]);

    const applyScheduleDelta = useCallback(async (daysDelta, anchorStartDate, anchorEndDate) => {
        if (!daysDelta || !anchorStartDate) {
            return { taskCount: 0, phaseCount: 0, selectedTaskIds: [], selectedPhaseIds: [] };
        }
        const selection = suggestDownstreamScheduleImpactSelection({
            tasks: allTasks,
            phases: projectPhases,
            startDate: anchorStartDate,
            endDate: anchorEndDate || anchorStartDate,
        });
        const selectedTaskIds = selection.selectedTaskIds || [];
        const selectedPhaseIds = selection.selectedPhaseIds || [];
        if (selectedTaskIds.length === 0 && selectedPhaseIds.length === 0) {
            return { taskCount: 0, phaseCount: 0, selectedTaskIds, selectedPhaseIds };
        }
        const { directTaskUpdates, directPhaseUpdates } = applyScheduleImpact({
            tasks: allTasks,
            dependencies: taskDependencies,
            phases: projectPhases,
            selectedTaskIds,
            selectedPhaseIds,
            daysLost: daysDelta,
            cascade: false,
            dependencyMode: projectDependencyMode,
        });
        const taskUpdateResults = await Promise.all(
            directTaskUpdates.map(async (u) => {
                const payload = {};
                if (u.start_date !== undefined) payload.start_date = u.start_date;
                if (u.due_date !== undefined) payload.due_date = u.due_date;
                if (Object.keys(payload).length === 0) return null;
                const { error } = await supabaseClient.from('tasks').update(payload).eq('id', u.taskId);
                return error || null;
            })
        );
        const firstTaskError = taskUpdateResults.find(Boolean);
        if (firstTaskError) throw firstTaskError;

        const phaseUpdateResults = await Promise.all(
            directPhaseUpdates.map(async (u) => {
                const payload = {};
                if (u.start_date !== undefined) payload.start_date = u.start_date;
                if (u.end_date !== undefined) payload.end_date = u.end_date;
                if (Object.keys(payload).length === 0) return null;
                const { error } = await supabaseClient.from('project_phases').update(payload).eq('id', u.phaseId);
                return error || null;
            })
        );
        const firstPhaseError = phaseUpdateResults.find(Boolean);
        if (firstPhaseError) throw firstPhaseError;

        await syncProjectDueDateFromTasks();

        return {
            taskCount: directTaskUpdates.length,
            phaseCount: directPhaseUpdates.length,
            selectedTaskIds,
            selectedPhaseIds,
        };
    }, [allTasks, projectPhases, projectDependencyMode, syncProjectDueDateFromTasks, taskDependencies]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const dl = startDate && endDate ? computedDaysLost : 1;
        if (!title.trim()) {
            addToast(t('weather.title_required'), 'warning');
            return;
        }
        if (applyScheduleShift && (!startDate || !endDate)) {
            addToast(t('weather.dates_required'), 'warning');
            return;
        }
        if (
            applyScheduleShift &&
            suggestedSelection.selectedTaskIds.length === 0 &&
            suggestedSelection.selectedPhaseIds.length === 0
        ) {
            addToast(t('weather.no_scheduled_items'), 'warning');
            return;
        }

        const affectedTaskIds = [...suggestedSelection.selectedTaskIds];
        const affectedPhaseIds = [...suggestedSelection.selectedPhaseIds];
        const isEditing = Boolean(editingImpact);

        setSaving(true);
        try {
            if (isEditing) {
                const previouslyApplied = editingImpact.schedule_shift_applied === true;
                const oldDaysLost = Number(editingImpact.days_lost || 0);
                const newDaysLost = Number(dl || 0);
                const daysDelta = newDaysLost - oldDaysLost;
                let shiftCounts = { taskCount: 0, phaseCount: 0 };

                if (previouslyApplied && daysDelta !== 0) {
                    shiftCounts = await applyScheduleDelta(
                        daysDelta,
                        editingImpact.start_date || startDate,
                        editingImpact.end_date || endDate
                    );
                } else if (!previouslyApplied && applyScheduleShift) {
                    shiftCounts = await applyScheduleDelta(newDaysLost, startDate, endDate);
                }

                const scheduleApplied = previouslyApplied || applyScheduleShift;
                const updated = await updateWeatherImpact(supabaseClient, editingImpact.id, {
                    title: title.trim(),
                    description: description.trim() || null,
                    start_date: startDate || null,
                    end_date: endDate || null,
                    days_lost: dl,
                    affected_task_ids: affectedTaskIds,
                    affected_phase_ids: affectedPhaseIds,
                    schedule_shift_applied: scheduleApplied,
                    applied_at: scheduleApplied ? new Date().toISOString() : null,
                });

                if (scheduleApplied && (shiftCounts.taskCount > 0 || shiftCounts.phaseCount > 0)) {
                    await logWeatherImpactScheduleApplied(
                        { ...updated, schedule_shift_applied: true },
                        user,
                        project.id,
                        orgId,
                        {
                            tasks_direct: shiftCounts.taskCount,
                            tasks_cascade: 0,
                            phases: shiftCounts.phaseCount,
                        }
                    );
                }

                addToast(
                    shiftCounts.taskCount > 0 || shiftCounts.phaseCount > 0
                        ? t('weather.schedule_applied', { count: shiftCounts.taskCount + shiftCounts.phaseCount })
                        : t('weather.impact_updated'),
                    'success'
                );
            } else {
                const row = await createWeatherImpact(supabaseClient, {
                    organization_id: orgId,
                    project_id: project.id,
                    impact_type: 'weather',
                    title: title.trim(),
                    description: description.trim() || null,
                    start_date: startDate || null,
                    end_date: endDate || null,
                    days_lost: dl,
                    affected_task_ids: affectedTaskIds,
                    affected_phase_ids: affectedPhaseIds,
                    apply_cascade: false,
                    schedule_shift_applied: false,
                    created_by_user_id: user?.id || null,
                });

                await logWeatherImpactRecorded(row, user, project.id, orgId);

                if (applyScheduleShift) {
                    const shiftCounts = await applyScheduleDelta(dl, startDate, endDate);

                    const nowIso = new Date().toISOString();
                    await updateWeatherImpact(supabaseClient, row.id, {
                        schedule_shift_applied: true,
                        applied_at: nowIso,
                    });

                    await logWeatherImpactScheduleApplied(
                        { ...row, schedule_shift_applied: true },
                        user,
                        project.id,
                        orgId,
                        {
                            tasks_direct: shiftCounts.taskCount,
                            tasks_cascade: 0,
                            phases: shiftCounts.phaseCount,
                        }
                    );

                    addToast(
                        t('weather.schedule_applied', { count: shiftCounts.taskCount + shiftCounts.phaseCount }),
                        'success'
                    );
                } else {
                    addToast(t('weather.impact_logged'), 'success');
                }
            }

            onApplied?.();

            setTitle('');
            setDescription('');
            setStartDate('');
            setEndDate('');
            setApplyScheduleShift(false);
            await loadImpacts();
            onClose?.();
        } catch (err) {
            console.error(err);
            addToast(err.message || t('weather.save_failed'), 'error');
            onApplied?.();
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteImpact = async () => {
        if (!editingImpact) return;
        if (!window.confirm(t('weather.delete_confirm'))) return;
        setSaving(true);
        try {
            const oldDaysLost = Number(editingImpact.days_lost || 0);
            let shiftCounts = { taskCount: 0, phaseCount: 0 };
            if (editingImpact.schedule_shift_applied && oldDaysLost > 0 && editingImpact.start_date) {
                shiftCounts = await applyScheduleDelta(
                    -oldDaysLost,
                    editingImpact.start_date,
                    editingImpact.end_date || editingImpact.start_date
                );
            }
            await deleteWeatherImpact(supabaseClient, editingImpact.id);
            addToast(
                shiftCounts.taskCount > 0 || shiftCounts.phaseCount > 0
                    ? t('weather.schedule_applied', { count: shiftCounts.taskCount + shiftCounts.phaseCount })
                    : t('weather.impact_deleted'),
                'success'
            );
            onApplied?.();
            onClose?.();
        } catch (err) {
            console.error(err);
            addToast(err.message || t('weather.delete_failed'), 'error');
            onApplied?.();
        } finally {
            setSaving(false);
        }
    };

    const handleQuickApplySchedule = async (impact, event) => {
        event?.stopPropagation();
        if (!impact || impact.schedule_shift_applied === true) return;

        const daysLost = Number(impact.days_lost || 1);
        if (!window.confirm(t('weather.apply_schedule_confirm', { count: daysLost }))) {
            return;
        }

        setApplyingImpactId(impact.id);
        try {
            const result = await applyScheduleToWeatherImpact({
                supabase: supabaseClient,
                impact,
                project,
                allTasks,
                projectPhases,
                taskDependencies,
                projectDependencyMode,
                user,
                orgId,
                dispatch,
            });

            if (result.taskCount > 0 || result.phaseCount > 0) {
                addToast(
                    t('weather.schedule_applied', { count: result.taskCount + result.phaseCount }),
                    'success',
                );
            } else if (!result.alreadyApplied) {
                addToast(t('weather.no_scheduled_items'), 'warning');
            }
            onApplied?.();
            await loadImpacts();
        } catch (err) {
            console.error(err);
            if (err.message === 'WEATHER_DATES_REQUIRED') {
                addToast(t('weather.dates_required'), 'warning');
            } else if (err.message === 'WEATHER_NO_SCHEDULED_ITEMS') {
                addToast(t('weather.no_scheduled_items'), 'warning');
            } else {
                addToast(err.message || t('weather.save_failed'), 'error');
            }
        } finally {
            setApplyingImpactId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
                <div className="border-b border-gray-200 px-5 py-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {editingImpact ? t('weather.impact_edit_title') : t('weather.impact_title')}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
                        aria-label={t('common.close')}
                    >
                        ✕
                    </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <LoadingSpinner />
                        </div>
                    ) : (
                        <>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {editingImpact && (
                                    <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                        {t('weather.editing_warning')}
                                    </p>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">{t('weather.impact_title_label')}</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(ev) => setTitle(ev.target.value)}
                                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                        placeholder={t('weather.impact_title_placeholder')}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">{t('weather.details_optional')}</label>
                                    <textarea
                                        value={description}
                                        onChange={(ev) => setDescription(ev.target.value)}
                                        rows={3}
                                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                        placeholder={t('weather.impact_description_placeholder')}
                                    />
                                </div>
                                <DateRangePicker
                                    label={t('weather.impact_dates')}
                                    startValue={startDate}
                                    endValue={endDate}
                                    onChange={({ start, end }) => {
                                        setStartDate(start);
                                        setEndDate(end || start);
                                    }}
                                    presets={datePresets}
                                    compact
                                />
                                {startDate && endDate ? (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">
                                            {t('weather.business_days_lost')}
                                        </label>
                                        <p className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900">
                                            {t(computedDaysLost === 1 ? 'weather.days_lost_one' : 'weather.days_lost_other', { count: computedDaysLost })}
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-500">
                                        {t('weather.business_days_hint')}
                                    </p>
                                )}

                                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                    <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                                        <input
                                            type="checkbox"
                                            checked={applyScheduleShift}
                                            onChange={(ev) => setApplyScheduleShift(ev.target.checked)}
                                        />
                                        {t('weather.apply_schedule_shift')}
                                    </label>
                                    {applyScheduleShift && (
                                        <p className="mt-2 text-xs text-gray-600">
                                            {t('weather.schedule_shift_hint')}
                                        </p>
                                    )}
                                </div>

                                {applyScheduleShift && (
                                    <>
                                        <p className="rounded border border-blue-100 bg-blue-50 p-2 text-xs text-blue-800">
                                            {t('weather.will_shift_dates', {
                                                tasks: suggestedSelection.selectedTaskIds.length,
                                                phases: suggestedSelection.selectedPhaseIds.length,
                                            })}
                                        </p>
                                        <p className="text-xs text-gray-600">
                                            {t('weather.preview_summary', {
                                                tasks: preview.directTasks,
                                                phases: preview.directPhases,
                                            })}
                                        </p>
                                        {preview.previewRows.length > 0 && (
                                            <div className="rounded border border-gray-200 bg-white p-2">
                                                <p className="mb-1 text-xs font-medium text-gray-700">{t('weather.date_preview')}</p>
                                                <ul className="space-y-1 text-xs text-gray-600">
                                                    {preview.previewRows.map((row) => (
                                                        <li key={row.id}>
                                                            <span className="font-medium text-gray-800">{row.label}</span>
                                                            {': '}
                                                            {row.before}
                                                            {' -> '}
                                                            {row.after}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </>
                                )}

                                <div className="flex justify-end gap-2 pt-2">
                                    {editingImpact && (
                                        <button
                                            type="button"
                                            onClick={handleDeleteImpact}
                                            disabled={saving}
                                            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                        >
                                            {t('weather.delete_impact')}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                        {t('common.cancel')}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        {saving ? t('weather.saving') : editingImpact ? t('weather.update_impact') : t('weather.save_impact')}
                                    </button>
                                </div>
                            </form>

                            <div className="border-t border-gray-200 pt-4">
                                <h3 className="text-sm font-semibold text-gray-800 mb-2">{t('weather.previous_impacts')}</h3>
                                {impacts.length === 0 ? (
                                    <p className="text-xs text-gray-500">{t('weather.no_impacts')}</p>
                                ) : (
                                    <ul className="space-y-2 max-h-40 overflow-y-auto text-sm">
                                        {impacts.map((im) => (
                                            <li
                                                key={im.id}
                                                className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 cursor-pointer hover:bg-gray-100"
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setEditingImpactId(im.id)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        setEditingImpactId(im.id);
                                                    }
                                                }}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="font-medium text-gray-900">{im.title}</div>
                                                        <div className="text-xs text-gray-600">
                                                            {t('weather.impact_days_lost', { count: im.days_lost })}
                                                            {im.schedule_shift_applied
                                                                ? ` · ${t('weather.schedule_updated')}`
                                                                : ` · ${t('weather.schedule_unchanged')}`}
                                                        </div>
                                                    </div>
                                                    {!im.schedule_shift_applied ? (
                                                        <button
                                                            type="button"
                                                            onClick={(event) => handleQuickApplySchedule(im, event)}
                                                            disabled={applyingImpactId === im.id || saving}
                                                            className="shrink-0 rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                                                        >
                                                            {applyingImpactId === im.id
                                                                ? t('weather.applying_schedule')
                                                                : t('weather.apply_to_schedule')}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default WeatherImpactModal;
