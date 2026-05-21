import React, { useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import Icon from './Icon';
import Avatar from './Avatar';
import ProjectProgressCard from './ProjectProgressCard';
import PermissionGuard from './PermissionGuard';

const ProjectCard = memo(function ProjectCard({ project, onEdit, onDelete }) {
    const { i18n } = useTranslation();
    const { dispatch, state } = useAppContext();
    const [showActions, setShowActions] = useState(false);
    
    // Get all members for this project (any contact linked via project_contacts)
    const contacts = state.contacts || [];
    const teamMembers = contacts.filter(contact => 
        contact.project_contacts && contact.project_contacts.some(pc => pc.project_id === project.id)
    );
    
    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString(i18n.language, { month: 'long', day: 'numeric', year: 'numeric' });
    };

    const handleCardClick = (e) => {
        // Don't navigate if clicking on action buttons
        if (e.target.closest('.project-actions')) {
            return;
        }
        dispatch({ type: 'SET_PROJECT', payload: project.id });
        dispatch({ type: 'SET_VIEW', payload: 'Projects' });
    };

    const handleEdit = (e) => {
        e.stopPropagation();
        onEdit(project);
    };

    const handleDelete = (e) => {
        e.stopPropagation();
        onDelete(project);
    };

    return (
        <div 
            onClick={handleCardClick} 
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
            className="relative min-w-0 overflow-hidden rounded-xl bg-white p-4 space-y-3 cursor-pointer transition-all hover-lift animate-slide-in group"
            style={{ boxShadow: '0px 4px 12px rgba(0,0,0,0.05)' }}
            role="button"
            tabIndex={0}
            aria-label={`Project: ${project.name}, Status: ${project.status}, Due: ${formatDate(project.due_date)}`}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardClick(e);
                }
            }}
        >
            <div className="min-w-0 pr-14">
                <h3 className="text-xl font-bold ui-clamp-2" title={project.name}>{project.name}</h3>
                <p className="mt-1 text-xs text-gray-500 ui-ellipsis-1" title={project.project_type}>{project.project_type}</p>
                {project.notification_count > 0 && (
                    <div className="mt-2 flex h-5 min-w-5 w-fit items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                        {project.notification_count}
                    </div>
                )}
            </div>
            <div>
                <p className="text-xs text-gray-400 font-semibold">NEXT MILESTONE</p>
                <p
                    className="text-sm font-medium ui-clamp-2"
                    title={typeof project.next_milestone === 'string' ? project.next_milestone : (project.next_milestone?.name || project.next_milestone?.title || 'No milestone')}
                >
                    {typeof project.next_milestone === 'string' ? project.next_milestone : (project.next_milestone?.name || project.next_milestone?.title || 'No milestone')}
                </p>
            </div>
            
            {/* Progress Status */}
            <ProjectProgressCard project={project} />
            
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100">
                <div className="min-w-0">
                    <p className="text-xs text-gray-400 font-semibold">DUE DATE</p>
                    <p className="text-sm font-medium ui-clamp-2">{formatDate(project.due_date)}</p>
                </div>
                <div className="flex shrink-0 -space-x-2">
                    {teamMembers.slice(0, 3).map(member => (
                        <Avatar key={member.id} name={member.name} size="sm" />
                    ))}
                    {teamMembers.length === 0 && (
                        <div className="text-xs text-gray-400 italic">No team assigned</div>
                    )}
                </div>
            </div>
            
            {/* Action buttons */}
            <div
                className={`project-actions absolute top-3 right-3 flex overflow-hidden rounded-lg border border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-sm transition-opacity ${showActions ? 'opacity-100' : 'opacity-0'}`}
                role="group"
                aria-label="Project actions"
            >
                <PermissionGuard permission="can_edit_projects">
                    <button
                        onClick={handleEdit}
                        className="p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label={`Edit project: ${project.name}`}
                    >
                        <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" className="h-3.5 w-3.5" />
                    </button>
                </PermissionGuard>
                <PermissionGuard permission="can_delete_projects">
                    <button
                        onClick={handleDelete}
                        className="border-l border-slate-200/80 p-1.5 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Delete project: ${project.name}`}
                    >
                        <Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="h-3.5 w-3.5" />
                    </button>
                </PermissionGuard>
            </div>
        </div>
    );
});

export default ProjectCard;

