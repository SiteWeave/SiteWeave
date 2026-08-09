import React from 'react';
import { useTranslation } from 'react-i18next';
import { parseLocalDateOnly } from '../../utils/dateHelpers';

/**
 * Project health band: overall %, status counts, schedule timeline (no phase chrome).
 */
function formatShortDate(iso, locale) {
    const d = parseLocalDateOnly(iso);
    if (!d) return null;
    return d.toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric' });
}

function PhasesSummaryStrip({
    overallProgress,
    taskCount = 0,
    statusCounts = null,
    scheduleTimeline = null,
    scheduleSlipDays = null,
}) {
    const { t, i18n } = useTranslation();
    const overall = Math.max(0, Math.min(100, Math.round(Number(overallProgress) || 0)));

    const counts = statusCounts || {
        complete: 0,
        in_progress: 0,
        can_start: 0,
        waiting: 0,
    };

    if (!taskCount && overall === 0) return null;

    const statusCards = [
        {
            key: 'complete',
            count: counts.complete,
            label: t('projectDetail.health_complete', { defaultValue: 'Complete' }),
            className: 'bg-[#eef9e8] text-emerald-900',
        },
        {
            key: 'in_progress',
            count: counts.in_progress,
            label: t('projectDetail.health_in_progress', { defaultValue: 'In progress' }),
            className: 'bg-violet-50 text-violet-900',
        },
        {
            key: 'can_start',
            count: counts.can_start,
            label: t('projectDetail.health_can_start', { defaultValue: 'Can start' }),
            className: 'bg-sky-50 text-sky-900',
        },
        {
            key: 'waiting',
            count: counts.waiting,
            label: t('projectDetail.health_waiting', { defaultValue: 'Waiting' }),
            className: 'bg-orange-50 text-orange-900',
        },
    ];

    const slip = typeof scheduleSlipDays === 'number' ? scheduleSlipDays : null;
    const slipLabel =
        slip === null
            ? null
            : slip > 0
                ? t('projectDetail.health_days_behind', { count: slip })
                : slip < 0
                    ? t('projectDetail.health_days_ahead', { count: Math.abs(slip) })
                    : t('projectDetail.health_on_schedule');

    const schedulePct = Math.max(
        0,
        Math.min(100, Math.round(Number(scheduleTimeline?.schedule_progress_pct) || 0)),
    );
    const startLabel = formatShortDate(scheduleTimeline?.schedule_start, i18n.language);
    const endLabel = formatShortDate(scheduleTimeline?.schedule_end, i18n.language);
    const showTimeline = Boolean(scheduleTimeline?.schedule_day_total);

    return (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between xl:gap-8">
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                    <div className="shrink-0">
                        <p className="text-xs font-medium text-gray-400">
                            {t('projectDetail.health_overall_label', {
                                defaultValue: 'Overall progress',
                            })}
                        </p>
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                            <p
                                className="text-4xl font-semibold tracking-tight text-gray-900 tabular-nums leading-none"
                                aria-label={t('projectDetail.overall_progress_aria', {
                                    defaultValue: 'Overall project progress',
                                })}
                            >
                                {overall}%
                            </p>
                            <p className="text-sm text-gray-500">
                                {t('projectDetail.health_of_tasks', {
                                    count: taskCount,
                                    defaultValue: 'of {{count}} tasks',
                                })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {statusCards.map((card) => (
                            <div
                                key={card.key}
                                className={`min-w-[4.5rem] rounded-xl px-3 py-2 ${card.className}`}
                            >
                                <p className="text-xl font-semibold tabular-nums leading-none">
                                    {card.count}
                                </p>
                                <p className="mt-1 text-[11px] font-medium opacity-80">{card.label}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {showTimeline && (
                    <div className="w-full min-w-0 xl:max-w-sm xl:flex-1">
                        {(startLabel || endLabel) && (
                            <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-gray-500 tabular-nums">
                                <span>{startLabel || '—'}</span>
                                <span>{endLabel || '—'}</span>
                            </div>
                        )}
                        <div
                            className="relative h-5"
                            role="progressbar"
                            aria-valuenow={schedulePct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={t('projectDetail.health_schedule_aria', {
                                defaultValue: 'Schedule progress',
                            })}
                        >
                            <div className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gray-200" />
                            <div
                                className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gray-900"
                                style={{ width: `${schedulePct}%` }}
                            />
                            <div
                                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-gray-900 shadow-sm"
                                style={{ left: `${schedulePct}%` }}
                            />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-gray-500 tabular-nums">
                                {t('projectDetail.health_day_of', {
                                    current: scheduleTimeline.schedule_day_current,
                                    total: scheduleTimeline.schedule_day_total,
                                    defaultValue: 'Day {{current}} of {{total}}',
                                })}
                            </p>
                            {slipLabel && (
                                <p
                                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                        slip > 0
                                            ? 'bg-orange-50 text-orange-800'
                                            : slip < 0
                                                ? 'bg-emerald-50 text-emerald-800'
                                                : 'bg-gray-100 text-gray-600'
                                    }`}
                                >
                                    {slipLabel}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default PhasesSummaryStrip;
