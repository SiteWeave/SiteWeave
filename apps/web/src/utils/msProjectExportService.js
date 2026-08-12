/**
 * Load a SiteWeave project schedule and download Microsoft Project XML.
 */

import { buildMsProjectXml, downloadMsProjectXml } from './msProjectXmlExporter.js';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 * @param {{ download?: boolean }} [options]
 * @returns {Promise<{
 *   success: boolean,
 *   error?: string,
 *   warnings?: string[],
 *   filename?: string,
 *   xml?: string,
 *   metrics?: object,
 * }>}
 */
export async function exportProjectToMsProjectXml(supabase, projectId, options = {}) {
  const download = options.download !== false;

  if (!supabase) {
    return { success: false, error: 'Missing Supabase client' };
  }
  if (!projectId) {
    return { success: false, error: 'Missing project id' };
  }

  try {
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, start_date, due_date, client_due_date')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return { success: false, error: projectError?.message || 'Project not found' };
    }

    const [{ data: phases, error: phasesError }, { data: tasks, error: tasksError }] =
      await Promise.all([
        supabase
          .from('project_phases')
          .select('id, name, order, start_date, end_date, progress')
          .eq('project_id', projectId)
          .order('order', { ascending: true }),
        supabase
          .from('tasks')
          .select(
            'id, text, start_date, due_date, duration_days, is_milestone, percent_complete, completed, parent_task_id, project_phase_id, assignee_id, contacts(name)'
          )
          .eq('project_id', projectId)
          .order('start_date', { ascending: true, nullsFirst: true }),
      ]);

    if (phasesError) {
      return { success: false, error: phasesError.message };
    }
    if (tasksError) {
      return { success: false, error: tasksError.message };
    }

    const taskRows = tasks || [];
    let dependencies = [];
    if (taskRows.length > 0) {
      const taskIds = taskRows.map((t) => t.id);
      const { data: depRows, error: depError } = await supabase
        .from('task_dependencies')
        .select('id, task_id, successor_task_id, dependency_type, lag_days')
        .in('task_id', taskIds);

      if (depError) {
        return { success: false, error: depError.message };
      }
      const idSet = new Set(taskIds);
      dependencies = (depRows || []).filter(
        (d) => idSet.has(d.task_id) && idSet.has(d.successor_task_id)
      );
    }

    const built = buildMsProjectXml({
      project,
      phases: phases || [],
      tasks: taskRows,
      dependencies,
    });

    if (download) {
      downloadMsProjectXml(built.xml, built.filename);
    }

    return {
      success: true,
      warnings: built.warnings,
      filename: built.filename,
      xml: download ? undefined : built.xml,
      metrics: built.metrics,
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message || 'Could not export Microsoft Project XML',
    };
  }
}
