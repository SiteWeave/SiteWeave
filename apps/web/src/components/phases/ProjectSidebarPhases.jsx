import React from 'react';
import { formatPhaseDateRange } from '../../utils/projectPhasesUtils';

function ProjectSidebarPhases({ phases, locale }) {
    if (!phases?.length) {
        return (
            <p className="text-sm text-gray-500">No phases yet.</p>
        );
    }

    return (
        <ul className="space-y-2">
            {phases.map((phase) => {
                const pct = Math.max(0, Math.min(100, Math.round(Number(phase.progress) || 0)));
                const dateLabel = formatPhaseDateRange(phase.start_date, phase.end_date, locale);
                return (
                    <li key={phase.id} className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-gray-900 truncate">{phase.name}</span>
                            <span className="text-xs font-semibold tabular-nums text-gray-700">{pct}%</span>
                        </div>
                        {dateLabel && (
                            <p className="mt-0.5 text-xs text-gray-500 tabular-nums">{dateLabel}</p>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

export default ProjectSidebarPhases;
