import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import {
  deletePmActions,
  formatLocalDateOnly,
  getPmActionsForDate,
  listPmActionsForProject,
  pmActionsRowHasContent,
  pmActionsTodayIso,
  upsertPmActions,
} from '@siteweave/core-logic';
import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';
import LoadingSpinner from './LoadingSpinner';
import DateRangePicker from './DateRangePicker';

const EMPTY_NOTES = {
  rfi_notes: '',
  long_lead_time_notes: '',
  change_orders_notes: '',
  submittals_notes: '',
};

const NOTE_FIELDS = [
  { key: 'rfi_notes', labelKey: 'rfi', placeholderKey: 'rfi_placeholder' },
  { key: 'submittals_notes', labelKey: 'submittals', placeholderKey: 'submittals_placeholder' },
  { key: 'long_lead_time_notes', labelKey: 'long_lead_time', placeholderKey: 'long_lead_time_placeholder' },
  { key: 'change_orders_notes', labelKey: 'change_orders', placeholderKey: 'change_orders_placeholder' },
];

function notesFromRow(row) {
  return {
    rfi_notes: row?.rfi_notes || '',
    long_lead_time_notes: row?.long_lead_time_notes || '',
    change_orders_notes: row?.change_orders_notes || '',
    submittals_notes: row?.submittals_notes || '',
  };
}

function filledFieldCount(row) {
  if (!row) return 0;
  return NOTE_FIELDS.reduce((n, { key }) => (String(row[key] || '').trim() ? n + 1 : n), 0);
}

/**
 * Edit PM Actions notes for a project. Saved notes appear in progress reports
 * when their as_of_date falls in the report window.
 */
function PmActionsModal({ project, onClose, onSaved }) {
  const { t, i18n } = useTranslation();
  const { state } = useAppContext();
  const { addToast } = useToast();
  const pk = (suffix) => `projectDetail.pm_actions.${suffix}`;
  const locale = i18n.language || undefined;

  const today = useMemo(() => pmActionsTodayIso(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [history, setHistory] = useState([]);
  const [asOfDate, setAsOfDate] = useState(today);
  const [currentRowId, setCurrentRowId] = useState(null);
  const [notes, setNotes] = useState({ ...EMPTY_NOTES });
  const [carriedFromDate, setCarriedFromDate] = useState(null);
  const [skipDateFetch, setSkipDateFetch] = useState(false);

  const formatAsOf = useCallback(
    (iso, withYear = true) =>
      formatLocalDateOnly(iso, locale, withYear ? { year: 'numeric' } : {}) || iso || '',
    [locale],
  );

  const isToday = asOfDate === today;
  const isExistingEntry = Boolean(currentRowId);

  const applyAsOfDate = useCallback((next) => {
    if (!next) return;
    setSkipDateFetch(false);
    setAsOfDate(next);
  }, []);

  const datePresets = (
    <button
      type="button"
      onClick={() => applyAsOfDate(today)}
      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-xs transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
    >
      {t(pk('today'))}
    </button>
  );

  const refreshHistory = useCallback(async () => {
    if (!project?.id) return [];
    const rows = await listPmActionsForProject(supabaseClient, project.id, { limit: 50 });
    setHistory(rows);
    return rows;
  }, [project?.id]);

  useEffect(() => {
    if (!project?.id) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await listPmActionsForProject(supabaseClient, project.id, { limit: 50 });
        if (cancelled) return;
        setHistory(rows);
        const todayRow = rows.find((r) => r.as_of_date === today) || null;
        const latest = rows[0] || null;
        if (todayRow) {
          setAsOfDate(today);
          setCurrentRowId(todayRow.id);
          setNotes(notesFromRow(todayRow));
          setCarriedFromDate(null);
        } else if (latest) {
          setAsOfDate(today);
          setCurrentRowId(null);
          setNotes(notesFromRow(latest));
          setCarriedFromDate(latest.as_of_date);
        } else {
          setAsOfDate(today);
          setCurrentRowId(null);
          setNotes({ ...EMPTY_NOTES });
          setCarriedFromDate(null);
        }
        setSkipDateFetch(true);
      } catch (error) {
        if (!cancelled) {
          addToast(t(pk('load_error'), { message: error.message }), 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!project?.id || loading) return undefined;
    if (skipDateFetch) {
      setSkipDateFetch(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await getPmActionsForDate(supabaseClient, project.id, asOfDate);
        if (cancelled) return;
        if (row) {
          setCurrentRowId(row.id);
          setNotes(notesFromRow(row));
          setCarriedFromDate(null);
          return;
        }
        const latest = history.find((r) => r.as_of_date !== asOfDate) || history[0] || null;
        setCurrentRowId(null);
        if (latest && pmActionsRowHasContent(latest)) {
          setNotes(notesFromRow(latest));
          setCarriedFromDate(latest.as_of_date);
        } else {
          setNotes({ ...EMPTY_NOTES });
          setCarriedFromDate(null);
        }
      } catch {
        /* keep current notes on date-switch fetch failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asOfDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectHistoryDate = (date) => {
    if (!date || date === asOfDate) return;
    setSkipDateFetch(false);
    setAsOfDate(date);
  };

  const goToToday = () => {
    if (asOfDate === today) return;
    setSkipDateFetch(false);
    setAsOfDate(today);
  };

  const handleSave = async () => {
    if (!project?.id) return;
    setSaving(true);
    try {
      const orgId = project.organization_id || state.currentOrganization?.id;
      if (!orgId) throw new Error('Organization required');
      const saved = await upsertPmActions(supabaseClient, {
        organization_id: orgId,
        project_id: project.id,
        as_of_date: asOfDate,
        rfi_notes: notes.rfi_notes || null,
        long_lead_time_notes: notes.long_lead_time_notes || null,
        change_orders_notes: notes.change_orders_notes || null,
        submittals_notes: notes.submittals_notes || null,
        created_by_user_id: state.user?.id || null,
      });
      setCurrentRowId(saved.id);
      setCarriedFromDate(null);
      await refreshHistory();
      addToast(t(pk('saved')), 'success');
      onSaved?.();
      onClose?.();
    } catch (error) {
      addToast(t(pk('save_error'), { message: error.message }), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentRowId) return;
    if (!window.confirm(t(pk('delete_confirm')))) return;
    setDeleting(true);
    try {
      await deletePmActions(supabaseClient, currentRowId);
      const rows = await refreshHistory();
      setCurrentRowId(null);
      const latest = rows[0] || null;
      if (latest) {
        setSkipDateFetch(true);
        setAsOfDate(latest.as_of_date);
        setCurrentRowId(latest.id);
        setNotes(notesFromRow(latest));
        setCarriedFromDate(null);
      } else {
        setSkipDateFetch(true);
        setAsOfDate(today);
        setNotes({ ...EMPTY_NOTES });
        setCarriedFromDate(null);
      }
      addToast(t(pk('deleted')), 'success');
      onSaved?.();
    } catch (error) {
      addToast(t(pk('delete_error'), { message: error.message }), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose} zIndexClass="z-50">
      <div
        className={`w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl ${MODAL_PANEL_MAX_H} flex flex-col`}
      >
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-xl font-semibold text-gray-900 text-balance">{t(pk('title'))}</h3>
              <p className="mt-1 text-sm text-gray-600 text-pretty">{t(pk('subtitle'))}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 active:scale-[0.96]"
              aria-label={t('common.close')}
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <aside className="w-full shrink-0 border-b border-gray-100 bg-slate-50/90 sm:w-52 sm:border-b-0 sm:border-r sm:overflow-y-auto">
            <div className="px-3 py-3 space-y-3">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {t(pk('history'))}
                </p>
                <span className="text-[10px] tabular-nums text-slate-400">
                  {history.length > 0 ? t(pk('history_count'), { count: history.length }) : null}
                </span>
              </div>

              <button
                type="button"
                onClick={goToToday}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors active:scale-[0.98] ${
                  isToday && !isExistingEntry && !loading
                    ? 'bg-sky-600 text-white shadow-sm'
                    : isToday
                      ? 'bg-sky-100 text-sky-900 ring-1 ring-sky-200'
                      : 'bg-white text-slate-700 ring-1 ring-slate-200/80 hover:bg-sky-50 hover:text-sky-900'
                }`}
              >
                <span>{t(pk('today'))}</span>
                <span className={`tabular-nums ${isToday ? 'opacity-90' : 'text-slate-400'}`}>
                  {formatAsOf(today, false)}
                </span>
              </button>

              {loading ? (
                <div className="flex justify-center py-6">
                  <LoadingSpinner />
                </div>
              ) : history.length === 0 ? (
                <p className="px-1 py-2 text-xs leading-relaxed text-slate-400">{t(pk('history_empty'))}</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto sm:max-h-none">
                  {history.map((row) => {
                    const active = row.as_of_date === asOfDate && isExistingEntry;
                    const rowIsToday = row.as_of_date === today;
                    const filled = filledFieldCount(row);
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => selectHistoryDate(row.as_of_date)}
                          className={`group flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors active:scale-[0.98] ${
                            active
                              ? 'bg-slate-900 text-white shadow-sm'
                              : 'text-slate-700 hover:bg-white hover:shadow-sm'
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium leading-none">
                              {formatAsOf(row.as_of_date, false)}
                            </span>
                            {rowIsToday ? (
                              <span
                                className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                  active ? 'bg-white/15 text-white' : 'bg-sky-100 text-sky-800'
                                }`}
                              >
                                {t(pk('today'))}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={`text-[10px] tabular-nums ${
                              active ? 'text-white/70' : 'text-slate-400'
                            }`}
                          >
                            {t(pk('fields_filled'), { count: filled })}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {loading ? (
              <div className="flex justify-center py-10">
                <LoadingSpinner />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        isExistingEntry
                          ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80'
                          : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200/80'
                      }`}
                    >
                      {isExistingEntry ? t(pk('entry_saved')) : t(pk('entry_new'))}
                    </span>
                  </div>
                  <DateRangePicker
                    id="pm-actions-as-of"
                    label={t(pk('as_of_date'))}
                    startValue={asOfDate}
                    endValue={asOfDate}
                    onChange={({ start, end }) => {
                      // Ignore Clear's empty payload; onClear resets to today.
                      const next = end || start;
                      if (!next) return;
                      applyAsOfDate(next);
                    }}
                    onSave={() => {}}
                    onClear={() => applyAsOfDate(today)}
                    clearLabel={t(pk('use_today'))}
                    presets={datePresets}
                    closeOnComplete
                    compact
                    elevated
                  />
                  <p className="text-xs text-slate-500 text-pretty">{t(pk('as_of_hint'))}</p>
                </div>

                {carriedFromDate ? (
                  <div className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
                    {t(pk('carried_forward'), { date: formatAsOf(carriedFromDate) })}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {NOTE_FIELDS.map(({ key, labelKey, placeholderKey }) => (
                    <div key={key} className="min-w-0">
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {t(pk(labelKey))}
                      </label>
                      <textarea
                        value={notes[key] || ''}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [key]: e.target.value }))}
                        rows={3}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        placeholder={t(pk(placeholderKey))}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-5 py-3">
          <div>
            {currentRowId ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving || loading}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 active:scale-[0.96]"
              >
                {deleting ? t(pk('deleting')) : t(pk('delete'))}
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.96]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || deleting || !asOfDate}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 active:scale-[0.96]"
            >
              {saving ? t('common.saving_ellipsis') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

export default PmActionsModal;
