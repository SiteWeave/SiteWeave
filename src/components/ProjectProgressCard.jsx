import React, { useState, useEffect } from 'react';
import { computeWeightedProjectProgressPercent } from '../utils/projectProgressRollup.js';
import { getStatusColor, normalizeStatusDisplay } from '../utils/projectHelpers';
import { supabaseClient } from '../context/AppContext';

function ProjectProgressCard({ project }) {
    const [phases, setPhases] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!project?.id) return;
        loadPhases();
    }, [project?.id]);

    const loadPhases = async () => {
        try {
            if (!project?.id) {
                setPhases([]);
                return;
            }
            const { data, error } = await supabaseClient
                .from('project_phases')
                .select('*')
                .eq('project_id', project.id)
                .order('order');

            if (error) {
                console.error('Error loading phases:', error);
                setPhases([]);
            } else {
                setPhases(data || []);
            }
        } catch (error) {
            console.error('Error loading phases:', error);
            setPhases([]);
        } finally {
            setIsLoading(false);
        }
    };

    const getProgressColor = (progress, dueDate) => {
        // Check if behind schedule (if due date exists and progress is low)
        const isBehindSchedule = dueDate && new Date(dueDate) < new Date() && progress < 100;
        if (isBehindSchedule) {
            return 'bg-red-500';
        }
        
        // Use green if progress is high (>= 75%), blue otherwise
        if (progress >= 75) {
            return 'bg-green-500';
        }
        
        return 'bg-blue-500';
    };

    if (isLoading) {
        return (
            <div className="p-4 bg-white rounded-xl" style={{ boxShadow: '0px 4px 12px rgba(0,0,0,0.05)' }}>
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
            </div>
        );
    }

    const overallProgress = computeWeightedProjectProgressPercent(phases, project?.due_date);

    return (
        <div className="p-4 bg-white rounded-xl" style={{ boxShadow: '0px 4px 12px rgba(0,0,0,0.05)' }}>
            <div className="flex min-w-0 justify-between items-center mb-3 gap-2">
                <h3 className="font-semibold text-sm text-gray-700 ui-ellipsis-1">Progress Status</h3>
                <span className="text-sm font-bold text-gray-900">{overallProgress}%</span>
            </div>
            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-2 mb-2 overflow-hidden">
                <div 
                    className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(overallProgress, project.due_date)}`}
                    style={{ 
                        width: `${Math.max(0, Math.min(100, overallProgress))}%`,
                        minWidth: overallProgress > 0 ? '2px' : '0px'
                    }}
                ></div>
            </div>

            <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 text-xs text-gray-500">
                    {phases.length > 0
                        ? `${phases.length} phases • ${phases.filter((p) => p.progress === 100).length} complete`
                        : null}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusColor(project.status)}`}>
                    {normalizeStatusDisplay(project.status) || 'No Status'}
                </span>
            </div>
        </div>
    );
}

export default ProjectProgressCard;
