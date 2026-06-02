/**
 * Projects Service
 * Handles all project-related database operations
 */

import {
  computeWeightedProjectProgressPercent,
  groupPhasesByProjectId,
} from '../utils/projectProgressRollup.js';

/** Columns for list/card views — update when ProjectCard / ProjectListView changes. */
export const PROJECT_LIST_COLUMNS = [
  'id',
  'name',
  'status',
  'due_date',
  'start_date',
  'project_type',
  'organization_id',
  'address',
  'updated_at',
  'created_at',
  'notification_count',
  'next_milestone',
  'project_manager_id',
  'created_by_user_id',
].join(',');

/**
 * Fetch all projects
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @returns {Promise<Array>} Array of projects
 */
export async function fetchProjects(supabase) {
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_LIST_COLUMNS)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

/**
 * Fetch a single project by ID
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} projectId - Project ID
 * @returns {Promise<Object|null>} Project object or null if not found
 */
export async function fetchProject(supabase, projectId) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();
  
  if (error) throw error;
  return data;
}

/**
 * Fetch projects for a specific user (based on project_contacts)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} contactId - Contact ID
 * @returns {Promise<Array>} Array of projects
 */
export async function fetchUserProjects(supabase, contactId) {
  const { data, error } = await supabase
    .from('project_contacts')
    .select(`project_id, projects!fk_project_contacts_project_id(${PROJECT_LIST_COLUMNS})`)
    .eq('contact_id', contactId);
  
  if (error) throw error;
  return (data || []).map(item => item.projects).filter(Boolean);
}

/**
 * Fetch active projects count for a user
 * Uses RLS policies to automatically filter projects based on user role
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - User ID (auth.users.id) - not used but kept for API consistency
 * @returns {Promise<number>} Count of active projects
 */
export async function fetchActiveProjectsCount(supabase, userId) {
  const { count, error } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'completed');
  
  if (error) throw error;
  return count || 0;
}

/**
 * Fetch user projects with calculated progress
 * Uses RLS policies to automatically filter projects based on user role
 * Two queries total: projects + batched phases (no N+1 per project).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - User ID (auth.users.id) - not used but kept for API consistency
 * @param {{ limit?: number }} [options]
 * @returns {Promise<Array>} Array of projects with progress
 */
export async function fetchUserProjectsWithProgress(supabase, userId, options = {}) {
  let query = supabase
    .from('projects')
    .select(PROJECT_LIST_COLUMNS)
    .order('updated_at', { ascending: false });

  if (options.limit != null) {
    query = query.limit(options.limit);
  }

  const { data: projects, error } = await query;
  if (error) throw error;
  
  const projectsList = projects || [];
  if (projectsList.length === 0) return [];

  const projectIds = projectsList.map((p) => p.id);

  const { data: allPhases, error: phasesError } = await supabase
    .from('project_phases')
    .select('project_id, progress, start_date, end_date, order')
    .in('project_id', projectIds);

  if (phasesError) throw phasesError;

  const phasesByProject = groupPhasesByProjectId(allPhases || []);

  return projectsList.map((project) => {
    const phases = phasesByProject[project.id] || [];
    if (phases.length === 0) {
      return { ...project, progress: 0 };
    }
    const progress = computeWeightedProjectProgressPercent(phases, project?.due_date);
    return { ...project, progress };
  });
}
