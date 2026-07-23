import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon';

function PhasesEmptyState({
    onAddPhase,
    onUseTemplate,
    isMutating = false,
}) {
    const { t } = useTranslation();

    return (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/80 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
                    <Icon
                        path="M4 6h16M4 10h16M4 14h16M4 18h16"
                        className="h-5 w-5 text-gray-400"
                        aria-hidden
                    />
                </div>
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900">
                        {t('projectDetail.phases_empty_title')}
                    </h3>
                    <p className="mt-0.5 text-sm text-gray-600">
                        {t('projectDetail.phases_empty_description')}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{t('projectDetail.phase_template_hint')}</p>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <button
                    type="button"
                    onClick={onAddPhase}
                    disabled={isMutating}
                    className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                    {t('build_path.add_phase')}
                </button>
                <button
                    type="button"
                    onClick={onUseTemplate}
                    disabled={isMutating}
                    className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                >
                    {t('projectDetail.use_phase_template')}
                </button>
            </div>
        </div>
    );
}

export default PhasesEmptyState;
