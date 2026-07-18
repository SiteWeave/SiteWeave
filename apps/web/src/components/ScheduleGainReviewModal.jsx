import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  applyScheduleAdjustmentRpc,
  buildPullForwardPreview,
  dismissScheduleAdjustment,
  getTaskEndDate,
  snapshotsFromCandidates,
  undoScheduleAdjustmentRpc,
} from '@siteweave/core-logic';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';
import { logScheduleAdjustmentApplied, logScheduleAdjustmentDismissed } from '../utils/activityLogger';

async function syncProjectDueDateFromTasks(project, dispatch) {
  if (!project?.id) return;
  const { data: postTasks, error } = await supabaseClient
    .from('tasks')
    .select('due_date, start_date, duration_days')
    .eq('project_id', project.id);
  if (error) throw error;
  let latestEnd = null;
  for (const task of postTasks || []) {
    const end = getTaskEndDate(task);
    if (end && (!latestEnd || end > latestEnd)) latestEnd = end;
  }

  const previousDue = project.due_date || null;
  const previousClientDue = project.client_due_date || null;
  let nextClientDue = previousClientDue;

  // Pull-forward moved the internal finish earlier — freeze the prior date for clients.
  if (latestEnd && previousDue && latestEnd < previousDue) {
    nextClientDue = previousClientDue || previousDue;
  } else if (latestEnd && previousClientDue && latestEnd >= previousClientDue) {
    // Caught up (undo / delay) — no need to mask an earlier finish.
    nextClientDue = null;
  }

  if (previousDue === latestEnd && previousClientDue === nextClientDue) return;

  const updates = { due_date: latestEnd };
  if (nextClientDue !== previousClientDue) {
    updates.client_due_date = nextClientDue;
  }

  const { error: updateError } = await supabaseClient
    .from('projects')
    .update(updates)
    .eq('id', project.id);
  if (updateError) throw updateError;
  dispatch?.({
    type: 'UPDATE_PROJECT',
    payload: { ...project, ...updates },
  });
}

function ScheduleGainReviewModal({
  project,
  allTasks,
  taskDependencies,
  adjustment,
  onClose,
  onChanged,
}) {
  const { t } = useTranslation();
  const { state, dispatch } = useAppContext();
  const { addToast } = useToast();
  const user = state.user;

  const sourceTask = useMemo(
    () => allTasks.find((task) => task.id === adjustment?.source_task_id) || null,
    [allTasks, adjustment?.source_task_id],
  );

  const [workdays, setWorkdays] = useState(Number(adjustment?.suggested_workdays) || 1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  const preview = useMemo(
    () =>
      buildPullForwardPreview({
        sourceTask: sourceTask || { id: adjustment?.source_task_id },
        tasks: allTasks,
        dependencies: taskDependencies,
        workdaysGained: workdays,
        actualFinishDate: adjustment?.actual_finish || null,
      }),
    [sourceTask, allTasks, taskDependencies, workdays, adjustment?.actual_finish, adjustment?.source_task_id],
  );

  useEffect(() => {
    setWorkdays(Number(adjustment?.suggested_workdays) || 1);
  }, [adjustment?.id, adjustment?.suggested_workdays]);

  useEffect(() => {
    setSelectedIds(new Set((preview.candidates || []).map((c) => c.taskId)));
  }, [preview.candidates, adjustment?.id, workdays]);

  const toggleTask = useCallback((taskId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const selectedCandidates = useMemo(
    () => (preview.candidates || []).filter((c) => selectedIds.has(c.taskId)),
    [preview.candidates, selectedIds],
  );

  const handleApply = async () => {
    if (!adjustment?.id) return;
    if (workdays < 1) {
      addToast(t('scheduleAdjustments.workdays_required'), 'warning');
      return;
    }
    if (selectedCandidates.length === 0) {
      addToast(t('scheduleAdjustments.select_at_least_one'), 'warning');
      return;
    }
    setSaving(true);
    try {
      const snapshots = snapshotsFromCandidates(selectedCandidates.map((c) => ({ ...c, selected: true })));
      const updated = await applyScheduleAdjustmentRpc(supabaseClient, adjustment.id, {
        workdays,
        selectedTaskIds: selectedCandidates.map((c) => c.taskId),
        snapshots,
      });
      await logScheduleAdjustmentApplied(updated || adjustment, user, project.id, project.organization_id, {
        tasks: selectedCandidates.length,
        workdays,
      });
      await syncProjectDueDateFromTasks(project, dispatch);
      addToast(
        t('scheduleAdjustments.applied_success', {
          count: selectedCandidates.length,
          days: workdays,
        }),
        'success',
      );
      onChanged?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      addToast(
        t('scheduleAdjustments.apply_failed', { message: err.message || String(err) }),
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async () => {
    if (!adjustment?.id) return;
    setSaving(true);
    try {
      const updated = await dismissScheduleAdjustment(supabaseClient, adjustment.id);
      await logScheduleAdjustmentDismissed(updated || adjustment, user, project.id, project.organization_id);
      addToast(t('scheduleAdjustments.dismissed'), 'success');
      onChanged?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      addToast(err.message || t('scheduleAdjustments.apply_failed', { message: String(err) }), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    if (!adjustment?.id) return;
    setSaving(true);
    try {
      await undoScheduleAdjustmentRpc(supabaseClient, adjustment.id);
      await syncProjectDueDateFromTasks(project, dispatch);
      addToast(t('scheduleAdjustments.undo_success'), 'success');
      onChanged?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      addToast(
        t('scheduleAdjustments.apply_failed', { message: err.message || String(err) }),
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!adjustment) return null;

  const isApplied = adjustment.status === 'applied';

  return (
    <ModalOverlay onClose={onClose} aria-labelledby="schedule-gain-title">
      <div className={`w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-xl ${MODAL_PANEL_MAX_H} flex flex-col`}>
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 id="schedule-gain-title" className="text-lg font-semibold text-gray-900">
            {t('scheduleAdjustments.review_title')}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {t('scheduleAdjustments.source_task')}:{' '}
            <span className="font-medium text-gray-900">
              {sourceTask?.text || adjustment.note || 'Task'}
            </span>
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">{t('scheduleAdjustments.planned_finish')}</p>
              <p className="font-medium text-gray-900">
                {adjustment.planned_finish || preview.plannedFinishDate || '—'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">{t('scheduleAdjustments.actual_finish')}</p>
              <p className="font-medium text-gray-900">
                {adjustment.actual_finish || preview.actualFinishDate || '—'}
              </p>
            </div>
          </div>

          {!isApplied ? (
            <label className="block text-sm">
              <span className="font-medium text-gray-800">{t('scheduleAdjustments.workdays_gained')}</span>
              <input
                type="number"
                min={1}
                value={workdays}
                onChange={(e) => setWorkdays(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-28 rounded-lg border border-gray-300 px-3 py-2"
              />
              <span className="mt-1 block text-xs text-gray-500">{t('scheduleAdjustments.workdays_hint')}</span>
            </label>
          ) : (
            <p className="text-sm text-gray-700">
              {t('scheduleAdjustments.workdays_gained')}:{' '}
              <strong>{adjustment.applied_workdays || workdays}</strong>
            </p>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t('scheduleAdjustments.affected_tasks')}</h3>
            {preview.candidates.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">{t('scheduleAdjustments.no_candidates')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
                {preview.candidates.map((row) => (
                  <li key={row.taskId} className="flex items-start gap-3 px-3 py-2 text-sm">
                    {!isApplied ? (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedIds.has(row.taskId)}
                        onChange={() => toggleTask(row.taskId)}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{row.text || t('weather.task_label')}</p>
                      <p className="text-xs text-gray-500">
                        {row.before_start || '—'} → {row.before_due || '—'}
                        {'  →  '}
                        <span className="text-emerald-700">
                          {row.after_start || '—'} → {row.after_due || '—'}
                        </span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {preview.excluded?.length ? (
              <p className="mt-2 text-xs text-gray-500">
                {t(
                  preview.excluded.length === 1
                    ? 'scheduleAdjustments.excluded_one'
                    : 'scheduleAdjustments.excluded_other',
                  { count: preview.excluded.length },
                )}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">{t('scheduleAdjustments.project_finish_before')}</p>
              <p className="font-medium">{preview.projectFinishBefore || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{t('scheduleAdjustments.project_finish_after')}</p>
              <p className="font-medium text-emerald-700">{preview.projectFinishAfter || '—'}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            disabled={saving}
          >
            {t('common.cancel')}
          </button>
          {isApplied ? (
            <button
              type="button"
              onClick={handleUndo}
              disabled={saving}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              {t('scheduleAdjustments.undo')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleDismiss}
                disabled={saving}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                {t('scheduleAdjustments.dismiss')}
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={saving || selectedCandidates.length === 0}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
              >
                {saving ? t('scheduleAdjustments.applying') : t('scheduleAdjustments.apply')}
              </button>
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}

export default ScheduleGainReviewModal;
