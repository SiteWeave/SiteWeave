// Helper functions for project calculations

import {
    computeWeightedProjectProgressPercent,
    groupPhasesByProjectId,
} from '@siteweave/core-logic';

export const calculateProjectProgress = async (projectId, supabaseClient) => {
    try {
        const [{ data: phases, error }, { data: project }] = await Promise.all([
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
        ]);

        if (error || !phases || phases.length === 0) return 0;
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
        const { data: allPhases, error } = await supabaseClient
            .from('project_phases')
            .select('project_id, progress, start_date, end_date, order')
            .in('project_id', projectIds)
            .order('order');

        if (error) throw error;

        const phasesByProject = groupPhasesByProjectId(allPhases || []);
        return projectList.reduce((acc, project) => {
            const phases = phasesByProject[project.id] || [];
            acc[project.id] = phases.length > 0
                ? computeWeightedProjectProgressPercent(phases, project?.due_date)
                : 0;
            return acc;
        }, {});
    } catch (error) {
        console.error('Error calculating batched project progress:', error);
        return {};
    }
};

export const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

export const formatDateShort = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
