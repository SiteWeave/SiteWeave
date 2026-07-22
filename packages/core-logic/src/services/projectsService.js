/**
 * Projects Service
 * Handles all project-related database operations
 */

import {
  computeWeightedProjectProgressPercent,
  groupPhasesByProjectId,
} from '../utils/projectProgressRollup.js';
import {
  buildPhasesWithDerivedProgress,
  calculatePhaseProgressFromTasks,
} from '../utils/projectPhasesUtils.js';

function groupTasksByProjectId(tasks) {
  const map = {};
  for (const task of tasks || []) {
    const projectId = task.project_id;
    if (!projectId) continue;
    if (!map[projectId]) map[projectId] = [];
    map[projectId].push(task);
  }
  return map;
}

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
  'trashed_at',
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
    .is('trashed_at', null)
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
    .is('trashed_at', null)
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
    .is('trashed_at', null)
    .neq('status', 'completed');
  
  if (error) throw error;
  return count || 0;
}

/**
 * Fetch user projects with calculated progress
 * Uses RLS policies to automatically filter projects based on user role
 * Three queries total: projects + batched phases + batched tasks (no N+1 per project).
 * Phase progress is derived from task percent_complete when tasks are linked to a phase.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} userId - User ID (auth.users.id) - not used but kept for API consistency
 * @param {{ limit?: number }} [options]
 * @returns {Promise<Array>} Array of projects with progress
 */
export async function fetchUserProjectsWithProgress(supabase, userId, options = {}) {
  let query = supabase
    .from('projects')
    .select(PROJECT_LIST_COLUMNS)
    .is('trashed_at', null)
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
    .select('id, project_id, progress, start_date, end_date, order')
    .in('project_id', projectIds);

  if (phasesError) throw phasesError;

  const { data: allTasks, error: tasksError } = await supabase
    .from('tasks')
    .select('project_id, project_phase_id, completed, percent_complete')
    .in('project_id', projectIds);

  if (tasksError) throw tasksError;

  const phasesByProject = groupPhasesByProjectId(allPhases || []);
  const tasksByProject = groupTasksByProjectId(allTasks || []);

  return projectsList.map((project) => {
    const phases = phasesByProject[project.id] || [];
    const tasks = tasksByProject[project.id] || [];
    if (phases.length === 0) {
      return { ...project, progress: calculatePhaseProgressFromTasks(tasks) };
    }
    const phasesWithProgress = buildPhasesWithDerivedProgress(phases, tasks);
    const progress = computeWeightedProjectProgressPercent(phasesWithProgress, project?.due_date);
    return { ...project, progress };
  });
}

/**
 * Create a new project in an organization.
 */
export async function createProject(supabase, { userId, organizationId, fields }) {
  if (!userId || !organizationId) {
    throw new Error('User and organization are required to create a project');
  }
  const nowIso = new Date().toISOString();
  const payload = {
    name: fields.name?.trim(),
    address: fields.address?.trim() || null,
    project_number: fields.project_number?.trim() || null,
    project_type: fields.project_type || 'Residential',
    status: fields.status || 'Planning',
    start_date: fields.start_date || null,
    due_date: fields.due_date || null,
    organization_id: organizationId,
    project_manager_id: userId,
    created_by_user_id: userId,
    updated_by_user_id: userId,
    updated_at: nowIso,
  };
  if (!payload.name) {
    throw new Error('Project name is required');
  }
  const { data, error } = await supabase.from('projects').insert(payload).select().single();
  if (error) throw error;
  return data;
}

/**
 * Update an existing project.
 */
export async function updateProject(supabase, projectId, { userId, fields }) {
  if (!projectId || !userId) {
    throw new Error('Project and user are required');
  }
  const payload = {
    updated_by_user_id: userId,
    updated_at: new Date().toISOString(),
  };
  if (fields.name !== undefined) payload.name = fields.name?.trim() || '';
  if (fields.address !== undefined) payload.address = fields.address?.trim() || null;
  if (fields.project_number !== undefined) payload.project_number = fields.project_number?.trim() || null;
  if (fields.project_type !== undefined) payload.project_type = fields.project_type || 'Residential';
  if (fields.status !== undefined) payload.status = fields.status;
  if (fields.start_date !== undefined) payload.start_date = fields.start_date || null;
  if (fields.due_date !== undefined) payload.due_date = fields.due_date || null;
  if (fields.name !== undefined && !payload.name) {
    throw new Error('Project name is required');
  }
  const { data, error } = await supabase
    .from('projects')
    .update(payload)
    .eq('id', projectId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
