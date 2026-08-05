import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Compact overall project progress for the Tasks tab — single line, no per-phase chips.
 */
function PhasesSummaryStrip({
    phases,
    overallProgress,
}) {
    const { t } = useTranslation();
    const overall = Math.max(0, Math.min(100, Math.round(Number(overallProgress) || 0)));
    const overallComplete = overall >= 100;

    if (!phases.length) return null;

    return (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5">
            <p className="shrink-0 text-sm font-medium text-gray-800 whitespace-nowrap">
                {t('projectDetail.phases_summary', {
                    count: phases.length,
                    progress: overall,
                })}
            </p>
            <div className="min-w-0 flex-1">
                <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{
                            width: `${overall}%`,
                            backgroundColor: overallComplete ? '#10B981' : '#3B82F6',
                        }}
                        role="progressbar"
                        aria-valuenow={overall}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={t('projectDetail.overall_progress_aria', {
                            defaultValue: 'Overall project progress',
                        })}
                    />
                </div>
            </div>
        </div>
    );
}

export default PhasesSummaryStrip;
