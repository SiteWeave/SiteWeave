import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { setAllPhaseSectionsExpanded } from '../../utils/projectPhasesUtils';

function PhaseChip({ phase, onJump }) {
    const pct = Math.max(0, Math.min(100, Math.round(Number(phase.progress) || 0)));
    const complete = pct >= 100;

    return (
        <button
            type="button"
            onClick={() => onJump(phase.id)}
            className="shrink-0 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-left text-xs hover:border-blue-300 hover:bg-blue-50/50 transition-colors max-w-[200px]"
        >
            <span className="font-medium text-gray-900 truncate">{phase.name}</span>
            <span className="flex items-center gap-1 shrink-0">
                <span className="w-12 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <span
                        className="block h-full rounded-full"
                        style={{
                            width: `${pct}%`,
                            backgroundColor: complete ? '#10B981' : '#3B82F6',
                        }}
                    />
                </span>
                <span className="text-gray-600 tabular-nums">{pct}%</span>
            </span>
        </button>
    );
}

function PhasesSummaryStrip({
    projectId,
    phases,
    overallProgress,
    includeUnassigned = false,
}) {
    const { t } = useTranslation();

    const phaseKeys = useCallback(() => {
        const keys = phases.map((p) => p.id);
        if (includeUnassigned) keys.push('unassigned');
        return keys;
    }, [phases, includeUnassigned]);

    const scrollToPhase = (phaseId) => {
        const el = document.getElementById(
            phaseId === 'unassigned' ? `phase-unassigned-${projectId}` : `phase-${phaseId}`,
        );
        if (!el) return;
        const prefersReduced =
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
    };

    const handleExpandAll = () => {
        setAllPhaseSectionsExpanded(projectId, phaseKeys(), true);
        window.dispatchEvent(new CustomEvent('siteweave:phase-collapse-all', {
            detail: { projectId, expanded: true },
        }));
    };

    const handleCollapseAll = () => {
        setAllPhaseSectionsExpanded(projectId, phaseKeys(), false);
        window.dispatchEvent(new CustomEvent('siteweave:phase-collapse-all', {
            detail: { projectId, expanded: false },
        }));
    };

    if (!phases.length) return null;

    return (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5">
            <div className="text-sm font-medium text-gray-700 shrink-0">
                {t('projectDetail.phases_summary', {
                    count: phases.length,
                    progress: overallProgress,
                })}
            </div>
            <div className="flex-1 min-w-0 overflow-x-auto flex gap-2 py-0.5 md:mx-2">
                {phases.map((phase) => (
                    <PhaseChip key={phase.id} phase={phase} onJump={scrollToPhase} />
                ))}
            </div>
            <div className="flex shrink-0 gap-2 text-xs">
                <button
                    type="button"
                    onClick={handleExpandAll}
                    className="font-medium text-blue-600 hover:text-blue-800 min-h-10 px-2"
                >
                    {t('projectDetail.expand_all_phases')}
                </button>
                <span className="text-gray-300" aria-hidden>|</span>
                <button
                    type="button"
                    onClick={handleCollapseAll}
                    className="font-medium text-gray-600 hover:text-gray-900 min-h-10 px-2"
                >
                    {t('projectDetail.collapse_all_phases')}
                </button>
            </div>
        </div>
    );
}

export default PhasesSummaryStrip;
