import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon';

/**
 * Add phase button for the Tasks tab toolbar.
 */
function PhasesToolbar({ onAddPhase, className = '' }) {
    const { t } = useTranslation();

    return (
        <div
            className={`inline-flex flex-wrap items-center gap-2 ${className}`}
            data-onboarding="phases-toolbar"
        >
            <button
                type="button"
                onClick={onAddPhase}
                className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            >
                <Icon path="M12 4v16m8-8H4" className="h-4 w-4 shrink-0" aria-hidden />
                <span>{t('projectDetail.add_phase')}</span>
            </button>
        </div>
    );
}

export default PhasesToolbar;
