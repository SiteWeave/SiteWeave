import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon';

function PhasesEmptyState({
    taskCount = 0,
    onAddPhase,
    onUseTemplate,
    isMutating = false,
}) {
    const { t } = useTranslation();

    return (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 px-6 py-10 text-center mb-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icon
                    path="M4 6h16M4 10h16M4 14h16M4 18h16"
                    className="w-8 h-8 text-gray-400"
                    aria-hidden
                />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {t('projectDetail.phases_empty_title')}
            </h3>
            <p className="text-gray-600 text-sm max-w-md mx-auto mb-2">
                {t('projectDetail.phases_empty_description')}
            </p>
            {taskCount > 0 && (
                <p className="text-gray-500 text-sm max-w-md mx-auto mb-4">
                    {t('projectDetail.phases_empty_with_tasks', { count: taskCount })}
                </p>
            )}
            <p className="text-xs text-gray-500 mb-4">{t('projectDetail.construction_template_hint')}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                    type="button"
                    onClick={onAddPhase}
                    disabled={isMutating}
                    className="px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                >
                    {t('build_path.add_phase')}
                </button>
                <button
                    type="button"
                    onClick={onUseTemplate}
                    disabled={isMutating}
                    className="px-4 py-2 border border-gray-300 bg-white text-gray-800 rounded-full text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
                >
                    {t('projectDetail.use_construction_template')}
                </button>
            </div>
        </div>
    );
}

export default PhasesEmptyState;
