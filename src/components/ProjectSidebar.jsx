import React from 'react';
import { useTranslation } from 'react-i18next';
import BuildPath from './BuildPath';

function ProjectSidebar({ project, showProjectPhases = true }) {
    const { t, i18n } = useTranslation();

    if (!project) return null;

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
    };

    const hasMilestones = project.milestones && Array.isArray(project.milestones) && project.milestones.length > 0;

    return (
        <div className="space-y-6">
            {hasMilestones && (
                <div className="p-6 bg-white rounded-xl shadow-xs border border-gray-200">
                    <h3 className="font-bold mb-3">{t('project_sidebar.overview')}</h3>
                    <ul className="space-y-3">
                        {project.milestones.map((m, index) => (
                            <li key={m.id ?? index} className="flex justify-between items-center text-sm">
                                <span className="font-medium">{m.name}</span>
                                <span className="text-gray-500">{t('project_sidebar.due')} {formatDate(m.due_date)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {showProjectPhases && (
                <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6 h-[600px] overflow-hidden">
                    <BuildPath project={project} />
                </div>
            )}
        </div>
    );
}

export default ProjectSidebar;
