import i18n from '../i18n/config';
import {
    computeWeightedProjectProgressPercent,
    groupPhasesByProjectId,
    calculatePhaseProgressFromTasks,
    formatDateForDisplay,
} from '@siteweave/core-logic';

export const calculateProjectProgress = async (projectId, supabaseClient) => {
    try {
        const [{ data: phases, error }, { data: project }, { data: tasks }] = await Promise.all([
            supabaseClient
                .from('project_phases')
                .select('progress, start_date, end_date, order')
                .eq('project_id', projectId)
                .order('order'),
            supabaseClient
                .from('projects')
                .select('due_date')
                .eq('id', projectId)
                .maybeSingle(),
            supabaseClient
                .from('tasks')
                .select('completed, percent_complete')
                .eq('project_id', projectId),
        ]);

        if (error) return 0;
        if (!phases || phases.length === 0) {
            return calculatePhaseProgressFromTasks(tasks || []);
        }
        return computeWeightedProjectProgressPercent(phases, project?.due_date);
    } catch (error) {
        console.error('Error calculating project progress:', error);
        return 0;
    }
};

export const calculateProjectsProgressMap = async (projects, supabaseClient) => {
    try {
        const projectList = Array.isArray(projects) ? projects.filter((project) => project?.id) : [];
        if (projectList.length === 0) return {};

        const projectIds = projectList.map((project) => project.id);
        const [{ data: allPhases, error }, { data: allTasks, error: tasksError }] = await Promise.all([
            supabaseClient
                .from('project_phases')
                .select('project_id, progress, start_date, end_date, order')
                .in('project_id', projectIds)
                .order('order'),
            supabaseClient
                .from('tasks')
                .select('project_id, completed, percent_complete')
                .in('project_id', projectIds),
        ]);

        if (error) throw error;
        if (tasksError) throw tasksError;

        const phasesByProject = groupPhasesByProjectId(allPhases || []);
        const tasksByProject = {};
        for (const task of allTasks || []) {
            const pid = task.project_id;
            if (!pid) continue;
            if (!tasksByProject[pid]) tasksByProject[pid] = [];
            tasksByProject[pid].push(task);
        }

        return projectList.reduce((acc, project) => {
            const phases = phasesByProject[project.id] || [];
            const tasks = tasksByProject[project.id] || [];
            acc[project.id] = {
                progress: phases.length > 0
                    ? computeWeightedProjectProgressPercent(phases, project?.due_date)
                    : calculatePhaseProgressFromTasks(tasks),
                phaseCount: phases.length,
                completeCount: phases.filter((p) => p.progress === 100).length,
            };
            return acc;
        }, {});
    } catch (error) {
        console.error('Error calculating batched project progress:', error);
        return {};
    }
};

export const formatDate = (dateString) => {
    if (!dateString) return '';
    return formatDateForDisplay(dateString, i18n.language || 'en', {
        month: 'long',
        year: 'numeric',
    });
};

export const formatDateShort = (dateString) => {
    if (!dateString) return '';
    return formatDateForDisplay(dateString, i18n.language || 'en', { month: 'short' });
};

export { normalizeStatusDisplay, getLocalizedProjectStatus } from '@siteweave/i18n';

export const getStatusColor = (status) => {
    if (!status) return 'bg-gray-100 text-gray-800';
    const normalized = status.trim().toLowerCase();
    switch (normalized) {
        case 'planning':
            return 'bg-blue-100 text-blue-800';
        case 'in progress':
        case 'in-progress':
            return 'bg-green-100 text-green-800';
        case 'on hold':
        case 'on-hold':
            return 'bg-yellow-100 text-yellow-900';
        case 'completed':
            return 'bg-gray-100 text-gray-800';
        case 'cancelled':
        case 'canceled':
            return 'bg-gray-100 text-gray-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
};
