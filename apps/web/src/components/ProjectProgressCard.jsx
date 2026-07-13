import React from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedProjectStatus } from '@siteweave/i18n';
import { getStatusColor } from '../utils/projectHelpers';
import { SkeletonText } from './ui/Skeleton';

function ProjectProgressCard({ project, progressData }) {
    const { t } = useTranslation();
    const isLoading = progressData?.loading ?? false;
    const overallProgress = progressData?.progress ?? 0;
    const phaseCount = progressData?.phaseCount ?? 0;
    const completeCount = progressData?.completeCount ?? 0;

    const getProgressColor = (progress, dueDate) => {
        const isBehindSchedule = dueDate && new Date(dueDate) < new Date() && progress < 100;
        if (isBehindSchedule) {
            return 'bg-red-500';
        }
        if (progress >= 75) {
            return 'bg-green-500';
        }
        return 'bg-blue-500';
    };

    if (isLoading) {
        return (
            <div className="p-4 bg-white rounded-xl" style={{ boxShadow: '0px 4px 12px rgba(0,0,0,0.05)' }}>
                <SkeletonText lines={3} />
            </div>
        );
    }

    return (
        <div className="p-4 bg-white rounded-xl" style={{ boxShadow: '0px 4px 12px rgba(0,0,0,0.05)' }}>
            <div className="flex min-w-0 justify-between items-center mb-3 gap-2">
                <h3 className="font-semibold text-sm text-gray-700 ui-ellipsis-1">{t('build_path.progress_status')}</h3>
                <span className="text-sm font-bold text-gray-900 tabular-nums">{overallProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-2 overflow-hidden">
                <div
                    className={`h-2 rounded-full transition-[width] duration-200 ease-out ${getProgressColor(overallProgress, project.due_date)}`}
                    style={{
                        width: `${Math.max(0, Math.min(100, overallProgress))}%`,
                        minWidth: overallProgress > 0 ? '2px' : '0px',
                    }}
                />
            </div>

            <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 text-xs text-gray-500">
                    {phaseCount > 0
                        ? t('projectProgress.phases_complete_summary', {
                            phaseCount,
                            completeCount,
                        })
                        : null}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusColor(project.status)}`}>
                    {getLocalizedProjectStatus(project.status, t) || t('projectProgress.no_status')}
                </span>
            </div>
        </div>
    );
}

export default ProjectProgressCard;
