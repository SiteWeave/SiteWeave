import React, { useState, useMemo, useEffect } from 'react';
import {
    formatDateShort,
    getStatusColor,
    normalizeStatusDisplay,
    calculateProjectsProgressMap,
} from '../utils/projectHelpers';
import { supabaseClient } from '../context/AppContext';
import PermissionGuard from './PermissionGuard';

function ProjectListView({ projects, onEdit, onDelete, onProjectClick }) {
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [projectData, setProjectData] = useState({});
    // Load progress for all projects (duration-weighted phase %; prefers task roll-up from DB)
    useEffect(() => {
        const loadProjectData = async () => {
            const initialData = {};
            projects.forEach(project => {
                initialData[project.id] = { progress: 0, loading: true };
            });
            setProjectData(initialData);

            try {
                const progressMap = await calculateProjectsProgressMap(projects, supabaseClient);
                const newData = {};
                projects.forEach((project) => {
                    newData[project.id] = { progress: progressMap[project.id] || 0, loading: false };
                });
                setProjectData(newData);
            } catch (error) {
                console.error('Error loading project data:', error);
            }
        };
        if (projects.length > 0) {
            loadProjectData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projects.length, projects.map(p => p.id).join(',')]);

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedProjects = useMemo(() => {
        if (!sortConfig.key) return projects;

        return [...projects].sort((a, b) => {
            let aValue, bValue;

            switch (sortConfig.key) {
                case 'name':
                    aValue = a.name?.toLowerCase() || '';
                    bValue = b.name?.toLowerCase() || '';
                    break;
                case 'status':
                    aValue = a.status?.toLowerCase() || '';
                    bValue = b.status?.toLowerCase() || '';
                    break;
                case 'progress':
                    aValue = projectData[a.id]?.progress || 0;
                    bValue = projectData[b.id]?.progress || 0;
                    break;
                case 'due_date':
                    aValue = a.due_date ? new Date(a.due_date).getTime() : 0;
                    bValue = b.due_date ? new Date(b.due_date).getTime() : 0;
                    break;
                default:
                    return 0;
            }

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [projects, sortConfig, projectData]);

    const SortIcon = ({ columnKey }) => {
        if (sortConfig.key !== columnKey) {
            return (
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
            );
        }
        return sortConfig.direction === 'asc' ? (
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
        ) : (
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        );
    };

    const getProgressColor = (progress) => {
        return 'bg-blue-500';
    };

    if (projects.length === 0) {
        return (
            <div className="app-card p-12 text-center">
                <p className="text-slate-500">No projects found.</p>
            </div>
        );
    }

    return (
        <div className="app-card overflow-hidden">
            <div className="w-full">
                <table className="w-full table-auto">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th
                                className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 min-w-[150px]"
                                onClick={() => handleSort('name')}
                            >
                                <div className="flex items-center gap-2">
                                    Project Name
                                    <SortIcon columnKey="name" />
                                </div>
                            </th>
                            <th
                                className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                onClick={() => handleSort('status')}
                            >
                                <div className="flex items-center gap-2">
                                    Status
                                    <SortIcon columnKey="status" />
                                </div>
                            </th>
                            <th
                                className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 min-w-[140px]"
                                onClick={() => handleSort('progress')}
                                title="Overall % from phase lengths and each phase’s progress (tasks and schedule)."
                            >
                                <div className="flex items-center gap-2">
                                    Progress
                                    <SortIcon columnKey="progress" />
                                </div>
                            </th>
                            <th
                                className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                onClick={() => handleSort('due_date')}
                            >
                                <div className="flex items-center gap-2">
                                    Due Date
                                    <SortIcon columnKey="due_date" />
                                </div>
                            </th>
                            <th className="px-4 sm:px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {sortedProjects.map((project) => {
                            const data = projectData[project.id] || { progress: 0 };
                            const progress = Math.max(0, Math.min(100, data.progress || 0));
                            return (
                                <tr
                                    key={project.id}
                                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                                    onClick={() => onProjectClick && onProjectClick(project)}
                                >
                                    <td className="px-4 sm:px-6 py-4">
                                        <div className="text-sm font-semibold text-gray-900">{project.name}</div>
                                        <div className="text-xs text-gray-500">{project.project_type}</div>
                                    </td>
                                    <td className="px-4 sm:px-6 py-4">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(project.status)}`}>
                                            {normalizeStatusDisplay(project.status) || 'N/A'}
                                        </span>
                                    </td>
                                    <td className="px-4 sm:px-6 py-4">
                                        {data.loading ? (
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <div className="flex-1 min-w-[80px] max-w-[120px] h-2.5 bg-gray-200 rounded-full animate-pulse"></div>
                                                <div className="w-12 h-4 bg-gray-200 rounded animate-pulse"></div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <div className="flex-1 min-w-[80px] max-w-[120px] bg-gray-200 rounded-full h-2.5 relative overflow-hidden">
                                                    {progress > 0 ? (
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-300 ${getProgressColor(progress)}`}
                                                            style={{
                                                                width: `${Math.max(0, Math.min(100, progress))}%`,
                                                                minWidth: '4px'
                                                            }}
                                                        ></div>
                                                    ) : (
                                                        <div
                                                            className="h-full rounded-full bg-gray-400 opacity-50"
                                                            style={{ width: '2px' }}
                                                        ></div>
                                                    )}
                                                </div>
                                                <span className="text-sm text-gray-600 font-medium whitespace-nowrap">{progress}%</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 sm:px-6 py-4 text-sm text-gray-600">
                                        {formatDateShort(project.due_date) || '—'}
                                    </td>
                                    <td className="px-4 sm:px-6 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
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
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default ProjectListView;
