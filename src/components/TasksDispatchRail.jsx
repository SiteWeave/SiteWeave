import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLocalDateOnly } from '../utils/dateHelpers';

const READY_CAP = 5;
const WAITING_CAP = 6;

/**
 * Compact Ready / Waiting dispatch board for the Tasks tab.
 */
function TasksDispatchRail({
  readyTasks = [],
  waitingTasks = [],
  getBlockerLabel,
  onSeeAllWaiting,
  className = '',
}) {
  const { t, i18n } = useTranslation();

  const formatStartDate = (iso) =>
    formatLocalDateOnly(iso, i18n.language, { month: 'short', year: 'numeric' }) || iso;

  const ready = useMemo(() => readyTasks.slice(0, READY_CAP), [readyTasks]);
  const waiting = useMemo(() => waitingTasks.slice(0, WAITING_CAP), [waitingTasks]);
  const waitingOverflow = Math.max(0, waitingTasks.length - waiting.length);

  return (
    <aside
      className={`rounded-xl border border-gray-200 bg-white p-4 shadow-xs ${className}`.trim()}
      aria-label={t('projectDetail.dispatch_ready_title')}
    >
      <section>
        <h3 className="text-sm font-semibold text-gray-900">
          {t('projectDetail.dispatch_ready_title')}
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          {t('projectDetail.dispatch_ready_subtitle')}
        </p>
        {ready.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">{t('projectDetail.dispatch_empty_ready')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {ready.map((task) => (
              <li
                key={task.id}
                className="rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2"
              >
                <p className="truncate text-sm font-medium text-gray-900" title={task.text}>
                  {task.text || t('common.untitled')}
                </p>
                {task.start_date ? (
                  <p className="mt-0.5 text-[11px] text-gray-500 tabular-nums">
                    {formatStartDate(task.start_date)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5 border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-gray-900">
          {t('projectDetail.dispatch_waiting_title')}
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          {t('projectDetail.dispatch_waiting_subtitle')}
        </p>
        {waiting.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">{t('projectDetail.dispatch_empty_waiting')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {waiting.map((task) => {
              const blocker = getBlockerLabel?.(task) || null;
              return (
                <li
                  key={task.id}
                  className="rounded-lg border border-orange-100 bg-orange-50/50 px-2.5 py-2"
                >
                  <p className="truncate text-sm font-medium text-gray-900" title={task.text}>
                    {task.text || t('common.untitled')}
                  </p>
                  {blocker ? (
                    <p className="mt-0.5 truncate text-[11px] text-orange-800/90" title={blocker}>
                      {t('projectDetail.dispatch_after', { blocker })}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {waitingTasks.length > 0 && onSeeAllWaiting ? (
          <button
            type="button"
            onClick={onSeeAllWaiting}
            className="mt-3 text-xs font-semibold text-gray-700 hover:text-gray-900"
          >
            {t('projectDetail.dispatch_see_all_waiting')}
            {waitingOverflow > 0 ? (
              <span className="ml-1 tabular-nums text-gray-400">(+{waitingOverflow})</span>
            ) : null}
          </button>
        ) : null}
      </section>
    </aside>
  );
}

export default TasksDispatchRail;
