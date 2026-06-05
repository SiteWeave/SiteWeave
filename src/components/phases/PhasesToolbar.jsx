import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon';

/**
 * Schedule + Add phase buttons for the Tasks tab toolbar.
 */
function PhasesToolbar({ onOpenSchedule, onAddPhase, className = '' }) {
    const { t } = useTranslation();

    return (
        <div
            className={`inline-flex flex-wrap items-center gap-2 ${className}`}
            data-onboarding="phases-toolbar"
        >
            <button
                type="button"
                onClick={onOpenSchedule}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50"
            >
                <Icon path="M4 6h16M4 10h16M4 14h16M4 18h16" className="h-4 w-4 shrink-0" aria-hidden />
                <span>{t('projectDetail.project_schedule')}</span>
            </button>
            <button
                type="button"
                onClick={onAddPhase}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50"
            >
                <Icon path="M12 4v16m8-8H4" className="h-4 w-4 shrink-0" aria-hidden />
                <span>{t('projectDetail.add_phase')}</span>
            </button>
        </div>
    );
}

export default PhasesToolbar;
