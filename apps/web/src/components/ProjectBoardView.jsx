import React, { useState, useEffect } from 'react';
import { useAppContext, supabaseClient } from '../context/AppContext';
import {
    formatDateShort,
    getStatusColor,
    normalizeStatusDisplay,
    calculateProjectsProgressMap,
} from '../utils/projectHelpers';
import PermissionGuard from './PermissionGuard';

function ProjectBoardView({ projects, onEdit, onDelete, onProjectClick }) {
    const { dispatch } = useAppContext();
    const [draggedProject, setDraggedProject] = useState(null);
    const [dragOverColumn, setDragOverColumn] = useState(null);
    const [projectData, setProjectData] = useState({});
    const [isLoading, setIsLoading] = useState(true);

    // Normalize project statuses to match canonical status names
    const normalizeStatus = (status) => {
        if (!status) return null;
        const lower = status.trim().toLowerCase();
        // Map variations to canonical names
        if (lower === 'planning') return 'Planning';
        if (lower === 'in progress' || lower === 'in-progress') return 'In Progress';
        if (lower === 'on hold' || lower === 'on-hold') return 'On Hold';
        if (lower === 'completed') return 'Completed';
        // Return trimmed original if not recognized
        return status.trim();
    };

    // Filter out cancelled and projects with no status (but include completed and on hold)
    const activeProjects = projects.filter(p => {
        const status = p.status?.trim().toLowerCase();
        return status && status !== 'cancelled' && status !== 'canceled';
    });
    
    // Define all valid statuses in the desired order (using canonical casing)
    const statusOrder = ['Planning', 'In Progress', 'On Hold', 'Completed'];
    
    // Get unique normalized statuses from projects
    const projectStatuses = [...new Set(activeProjects.map(p => normalizeStatus(p.status)).filter(Boolean))];
    
    // Combine project statuses with valid statuses, then sort by the defined order
    const allStatuses = [...new Set([...projectStatuses, ...statusOrder])];
    const statuses = allStatuses.sort((a, b) => {
        const indexA = statusOrder.findIndex(s => s.toLowerCase() === a.toLowerCase());
        const indexB = statusOrder.findIndex(s => s.toLowerCase() === b.toLowerCase());
        // If status not in order list, put it at the end
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    // Load progress data for all projects IN PARALLEL
    useEffect(() => {
        const loadProjectData = async () => {
            setIsLoading(true);
            // Initialize with loading state
            const initialData = {};
            activeProjects.forEach(project => {
                initialData[project.id] = { progress: 0, loading: true };
            });
            setProjectData(initialData);
            
            try {
                const progressMap = await calculateProjectsProgressMap(activeProjects, supabaseClient);
                const data = {};
                activeProjects.forEach((project) => {
                    data[project.id] = { progress: progressMap[project.id] || 0, loading: false };
                });
                setProjectData(data);
            } catch (error) {
                console.error('Error loading project data:', error);
            } finally {
                setIsLoading(false);
            }
        };
        if (activeProjects.length > 0) {
            loadProjectData();
        } else {
            setIsLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeProjects.length, activeProjects.map(p => p.id).join(',')]);

    const handleDragStart = (e, project) => {
        setDraggedProject(project);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.target);
        e.target.style.opacity = '0.4';
    };

    const handleDragEnd = (e) => {
        e.target.style.opacity = '1';
        setDraggedProject(null);
        setDragOverColumn(null);
    };

    const handleDragOver = (e, status) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverColumn(status);
    };

    const handleDragLeave = (e) => {
        // Only clear if we're leaving the column container, not child elements
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
            setDragOverColumn(null);
        }
    };

    const handleDrop = async (e, newStatus) => {
        e.preventDefault();
        setDragOverColumn(null);
        
        // Case-insensitive comparison
        if (!draggedProject || draggedProject.status?.toLowerCase() === newStatus?.toLowerCase()) {
            setDraggedProject(null);
            return;
        }

        try {
            const { error } = await supabaseClient
                .from('projects')
                .update({ 
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', draggedProject.id);

            if (error) {
                console.error('Error updating project status:', error);
                setDraggedProject(null);
                return;
            }

            // Update local state
            dispatch({
                type: 'UPDATE_PROJECT',
                payload: { ...draggedProject, status: newStatus }
            });
        } catch (error) {
            console.error('Error updating project status:', error);
        }

        setDraggedProject(null);
    };

    const getProjectsByStatus = (status) => {
        return activeProjects.filter(p => {
            const normalizedProjectStatus = normalizeStatus(p.status);
            const normalizedTargetStatus = normalizeStatus(status);
            return normalizedProjectStatus === normalizedTargetStatus;
        });
    };

    const getProgressColor = (progress) => {
        return 'bg-blue-500';
    };



    if (activeProjects.length === 0) {
        return (
            <div className="app-card p-12 text-center">
                <p className="text-slate-500">No active projects found.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max">
                {statuses.map((status) => {
                    const statusProjects = getProjectsByStatus(status);
                    const displayStatus = normalizeStatusDisplay(status) || status || 'Unknown Status';
                    const statusColorClasses = getStatusColor(status);
                    const isBeingDraggedOver = dragOverColumn === status;
                    const isDraggingFromThisColumn = draggedProject && normalizeStatus(draggedProject.status) === status;
                    
                    return (
                        <div
                            key={status}
                            className={`shrink-0 w-72 rounded-lg p-4 transition-all duration-200 ${
                                isBeingDraggedOver 
                                    ? 'bg-blue-50 border-2 border-blue-400 border-dashed shadow-lg scale-105' 
                                    : 'bg-gray-50 border-2 border-transparent'
                            }`}
                            onDragOver={(e) => handleDragOver(e, status)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, status)}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <span 
                                        className={`inline-block px-3 py-1.5 text-xs font-bold rounded-full ${statusColorClasses}`}
                                        style={{ 
                                            minWidth: '70px', 
                                            textAlign: 'center',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        {displayStatus}
                                    </span>
                                    <span className="text-gray-600 font-medium text-sm">({statusProjects.length})</span>
                                </div>
                            </div>
                            <div className="space-y-3 min-h-[100px]">
                                {statusProjects.map((project) => {
                                    const data = projectData[project.id] || { progress: 0 };
                                    const isBeingDragged = draggedProject?.id === project.id;
                                    return (
                                        <div
                                            key={project.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, project)}
                                            onDragEnd={handleDragEnd}
                                            onClick={() => onProjectClick && onProjectClick(project)}
                                            className={`app-card rounded-xl p-3 cursor-move hover:shadow-md transition-all duration-200 ${
                                                isBeingDragged ? 'opacity-40 scale-95' : 'opacity-100'
                                            }`}
                                        >
                                            <div className="mb-2">
                                                <h4 className="font-semibold text-sm text-gray-900 mb-1">{project.name}</h4>
                                                {project.due_date && (
                                                    <p className="text-xs text-gray-500">
                                                        Due: {formatDateShort(project.due_date)}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="mt-2">
                                                {data.loading ? (
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full animate-pulse"></div>
                                                        <div className="w-10 h-3 bg-gray-200 rounded animate-pulse"></div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                                            {data.progress > 0 ? (
                                                                <div
                                                                    className={`h-1.5 rounded-full transition-all duration-300 ${getProgressColor(data.progress)}`}
                                                                    style={{ 
                                                                        width: `${Math.max(0, Math.min(100, data.progress))}%`,
                                                                        minWidth: '2px'
                                                                    }}
                                                                ></div>
                                                            ) : (
                                                                <div
                                                                    className="h-1.5 rounded-full bg-gray-400 opacity-50"
                                                                    style={{ width: '2px' }}
                                                                ></div>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-gray-600 w-10 text-right font-medium">{data.progress || 0}%</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-gray-100">
                                                <PermissionGuard permission="can_edit_projects">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onEdit(project);
                                                        }}
                                                        className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                                        title="Edit"
                                                    >
                                                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </button>
                                                </PermissionGuard>
                                                <PermissionGuard permission="can_delete_projects">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onDelete(project);
                                                        }}
                                                        className="rounded-md p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                                                        title="Delete"
                                                    >
                                                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </PermissionGuard>
                                            </div>
                                        </div>
                                    );
                                })}
                                {statusProjects.length === 0 && !isBeingDraggedOver && (
                                    <div className="text-center py-8 text-sm text-gray-400 border-2 border-dashed border-gray-300 rounded-lg">
                                        Drop projects here
                                    </div>
                                )}
                                {/* Drop indicator */}
                                {isBeingDraggedOver && draggedProject && normalizeStatus(draggedProject.status) !== status && (
                                    <div className="mt-3 p-4 border-2 border-blue-400 border-dashed rounded-lg bg-blue-50 text-center animate-pulse">
                                        <svg className="w-6 h-6 mx-auto text-blue-500 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                        </svg>
                                        <p className="text-xs text-blue-600 font-semibold mt-1">Drop here to move</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default ProjectBoardView;

