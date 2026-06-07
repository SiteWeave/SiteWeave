import React from 'react';
import { formatLocalDateOnly } from '../utils/dateHelpers';

/**
 * Inline row showing a logged weather / schedule impact in the task list.
 */
function WeatherDelayMarker({ impact, onClick }) {
    if (!impact) return null;
    const startLabel = formatLocalDateOnly(impact.start_date);
    const endLabel = formatLocalDateOnly(impact.end_date);
    const range =
        startLabel && endLabel
            ? `${startLabel} → ${endLabel}`
            : startLabel || endLabel || '';
    const groupedCount = Number(impact.grouped_count || 0);
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
            </div>
        </li>
    );
}

export default WeatherDelayMarker;
