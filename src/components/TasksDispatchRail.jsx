import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { localDateIso, addDaysIso, formatLocalDateOnly } from '../utils/dateHelpers';

const PING_CAP = 6;
const OWNER_CAP = 5;
const ACTION_HORIZON_DAYS = 3;

/**
 * @param {{ start_date?: string|null, due_date?: string|null }} task
 * @returns {string|null}
 */
export function getActionAnchorDate(task) {
  const start = typeof task?.start_date === 'string' ? task.start_date.slice(0, 10) : '';
  if (start) return start;
  const due = typeof task?.due_date === 'string' ? task.due_date.slice(0, 10) : '';
  return due || null;
}

/**
 * Incomplete task with start/due overdue or within the next `horizonDays`.
 * @param {object} task
 * @param {{ todayIso?: string, horizonDays?: number }} [options]
 */
export function isInActionWindow(task, options = {}) {
  const todayIso = options.todayIso || localDateIso();
  const horizonDays = Number.isFinite(options.horizonDays) ? options.horizonDays : ACTION_HORIZON_DAYS;
  const anchor = getActionAnchorDate(task);
  if (!anchor) return false;
  const pct = Math.max(
    0,
    Math.min(100, Number(task.percent_complete ?? (task.completed ? 100 : 0)) || 0),
  );
  if (task.completed || pct >= 100) return false;
  const latest = addDaysIso(todayIso, horizonDays);
  return anchor <= latest;
}

/**
 * @param {string} anchorIso
 * @param {string} todayIso
 * @returns {number} signed calendar-day delta (anchor - today)
 */
function calendarDaysFromToday(anchorIso, todayIso) {
  const a = new Date(`${anchorIso}T12:00:00`);
  const b = new Date(`${todayIso}T12:00:00`);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/**
 * Compact Action Center for the Tasks tab: nudge, assign, weather review.
 */
function TasksDispatchRail({
  pingTasks = [],
  needsOwnerTasks = [],
  pendingWeatherCount = 0,
  canShowPing = false,
  canAssign = false,
  canReviewWeather = false,
  onPingTask,
  onAssignTask,
  onReviewWeather,
  className = '',
}) {
  const { t, i18n } = useTranslation();
  const todayIso = localDateIso();

  const ping = useMemo(() => pingTasks.slice(0, PING_CAP), [pingTasks]);
  const needsOwner = useMemo(() => needsOwnerTasks.slice(0, OWNER_CAP), [needsOwnerTasks]);
  const showWeather = pendingWeatherCount > 0 && canReviewWeather && typeof onReviewWeather === 'function';

  const formatReason = (task) => {
    const anchor = getActionAnchorDate(task);
    if (!anchor) return null;
    const delta = calendarDaysFromToday(anchor, todayIso);
    const usesStart = Boolean(task.start_date);
    if (delta < 0) {
      return { text: t('projectDetail.action_reason_overdue'), overdue: true };
    }
    if (delta === 0) {
      return {
        text: usesStart
          ? t('projectDetail.action_reason_starts_today')
          : t('projectDetail.action_reason_due_today'),
        overdue: false,
      };
    }
    if (delta === 1) {
      return {
        text: usesStart
          ? t('projectDetail.action_reason_starts_tomorrow')
          : t('projectDetail.action_reason_due_tomorrow'),
        overdue: false,
      };
    }
    if (delta <= ACTION_HORIZON_DAYS) {
      return {
        text: usesStart
          ? t('projectDetail.action_reason_starts_in_days', { count: delta })
          : t('projectDetail.action_reason_due_in_days', { count: delta }),
        overdue: false,
      };
    }
    const label =
      formatLocalDateOnly(anchor, i18n.language, { month: 'short', day: 'numeric' }) || anchor;
    return {
      text: usesStart
        ? t('projectDetail.action_reason_starts_on', { date: label })
        : t('projectDetail.action_reason_due_on', { date: label }),
      overdue: false,
    };
  };

  const hasAny = ping.length > 0 || needsOwner.length > 0 || showWeather;

  return (
    <aside
      className={`rounded-xl border border-gray-200 bg-white p-4 shadow-xs ${className}`.trim()}
      aria-label={t('projectDetail.action_center_title')}
    >
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {t('projectDetail.action_center_title')}
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          {t('projectDetail.action_center_subtitle')}
        </p>
      </header>

      {!hasAny ? (
        <p className="text-sm text-gray-400">{t('projectDetail.action_center_empty')}</p>
      ) : null}

      {showWeather ? (
        <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-950">
                {t('projectDetail.action_weather_title')}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-900/90">
                {t(
                  pendingWeatherCount === 1
                    ? 'projectDetail.action_weather_summary_one'
                    : 'projectDetail.action_weather_summary_other',
                  { count: pendingWeatherCount },
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onReviewWeather}
              className="btn-smooth shrink-0 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-100"
            >
              {t('projectDetail.action_weather_cta')}
            </button>
          </div>
        </section>
      ) : null}

      {ping.length > 0 ? (
        <section className={showWeather ? 'border-t border-gray-100 pt-4' : ''}>
          <h4 className="text-sm font-semibold text-gray-900">
            {t('projectDetail.action_nudge_title')}
          </h4>
          <p className="mt-0.5 text-xs text-gray-500">
            {t('projectDetail.action_nudge_subtitle')}
          </p>
          <ul className="mt-3 space-y-2">
            {ping.map((task) => {
              const reason = formatReason(task);
              return (
                <li
                  key={task.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900" title={task.text}>
                      {task.text || t('common.untitled')}
                    </p>
                    {reason ? (
                      <p
                        className={`mt-0.5 truncate text-[11px] tabular-nums ${
                          reason.overdue ? 'text-orange-800' : 'text-gray-500'
                        }`}
                        title={reason.text}
                      >
                        {reason.text}
                      </p>
                    ) : null}
                  </div>
                  {canShowPing && typeof onPingTask === 'function' ? (
                    <button
                      type="button"
                      onClick={() => onPingTask(task)}
                      className="btn-smooth shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                    >
                      {t('projectDetail.action_ping_cta')}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {needsOwner.length > 0 ? (
        <section
          className={
            ping.length > 0 || showWeather ? 'mt-5 border-t border-gray-100 pt-4' : ''
          }
        >
          <h4 className="text-sm font-semibold text-gray-900">
            {t('projectDetail.action_owner_title')}
          </h4>
          <p className="mt-0.5 text-xs text-gray-500">
            {t('projectDetail.action_owner_subtitle')}
          </p>
          <ul className="mt-3 space-y-2">
            {needsOwner.map((task) => {
              const reason = formatReason(task);
              return (
                <li
                  key={task.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900" title={task.text}>
                      {task.text || t('common.untitled')}
                    </p>
                    {reason ? (
                      <p
                        className={`mt-0.5 truncate text-[11px] tabular-nums ${
                          reason.overdue ? 'text-orange-800' : 'text-gray-500'
                        }`}
                        title={reason.text}
                      >
                        {reason.text}
                      </p>
                    ) : null}
                  </div>
                  {typeof onAssignTask === 'function' ? (
                    <button
                      type="button"
                      onClick={() => onAssignTask(task)}
                      disabled={!canAssign}
                      className="btn-smooth shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('projectDetail.action_assign_cta')}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}

export default TasksDispatchRail;
export { ACTION_HORIZON_DAYS, PING_CAP, OWNER_CAP };
