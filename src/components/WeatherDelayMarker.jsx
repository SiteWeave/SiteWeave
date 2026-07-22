import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatLocalDateOnly } from '../utils/dateHelpers';

/**
 * Inline row showing a logged weather / schedule impact in the task list.
 */
function WeatherDelayMarker({ impact, onClick, onApplySchedule, applyingSchedule = false, canApplySchedule = false }) {
    const { t } = useTranslation();
    if (!impact) return null;
    const startLabel = formatLocalDateOnly(impact.start_date);
    const endLabel = formatLocalDateOnly(impact.end_date);
    const range =
        startLabel && endLabel
            ? `${startLabel} → ${endLabel}`
            : startLabel || endLabel || '';
    const groupedCount = Number(impact.grouped_count || 0);
    const scheduleApplied = impact.schedule_shift_applied === true;
    const showApply =
        canApplySchedule &&
        !scheduleApplied &&
        typeof onApplySchedule === 'function' &&
        !impact.is_grouped;

    return (
        <li
            className={`list-none border-l-4 border-amber-400 bg-amber-50/90 px-3 py-2 my-0.5 rounded-r-md ${
                onClick ? 'cursor-pointer hover:bg-amber-100/90' : ''
            }`}
            role={onClick ? 'button' : 'note'}
            tabIndex={onClick ? 0 : undefined}
            aria-label={`Weather delay: ${impact.title || 'Impact'}`}
            onClick={onClick}
            onKeyDown={(event) => {
                if (!onClick) return;
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onClick();
                }
            }}
        >
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-amber-900">Weather / delay</span>
                {impact.title ? <span className="text-amber-950">{impact.title}</span> : null}
                {range ? <span className="text-xs text-amber-800/90">{range}</span> : null}
                {impact.days_lost != null ? (
                    <span className="text-xs font-medium text-amber-900">
                        {impact.days_lost} business day{impact.days_lost !== 1 ? 's' : ''} lost
                    </span>
                ) : null}
                {groupedCount > 1 ? (
                    <span className="text-xs font-medium text-amber-900/90">
                        ({groupedCount} overlapping entries combined)
                    </span>
                ) : null}
                <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        scheduleApplied
                            ? 'bg-green-100 text-green-800'
                            : 'bg-white/80 text-amber-900 ring-1 ring-amber-200'
                    }`}
                >
                    {scheduleApplied ? t('weather.schedule_updated') : t('weather.schedule_unchanged')}
                </span>
                {showApply ? (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onApplySchedule(impact);
                        }}
                        disabled={applyingSchedule}
                        className="ml-auto rounded-full bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                    >
                        {applyingSchedule ? t('weather.applying_schedule') : t('weather.apply_to_schedule')}
                    </button>
                ) : null}
            </div>
        </li>
    );
}

export default WeatherDelayMarker;
