import React from 'react';
import BuildPath from './BuildPath';

function ProjectSidebar({ project, showProjectPhases = true }) {
    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const hasMilestones = project.milestones && Array.isArray(project.milestones) && project.milestones.length > 0;

    return (
        <div className="space-y-6">
            {hasMilestones && (
                <div className="p-6 app-card">
                    <h3 className="font-bold text-slate-900 mb-3">Overview</h3>
                    <ul className="space-y-3">
                        {project.milestones.map((m, index) => (
                            <li key={index} className="flex justify-between items-center text-sm">
                                <span className="font-medium">{m.name}</span>
                                <span className="text-gray-500">Due: {formatDate(m.due_date)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {showProjectPhases && (
            <div className="app-card p-6 h-[600px] overflow-hidden">
                <BuildPath project={project} />
            </div>
            )}
        </div>
    );
}

export default ProjectSidebar;
