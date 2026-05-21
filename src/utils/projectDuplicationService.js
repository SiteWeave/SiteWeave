/**
 * Project Duplication Service
 * Handles project duplication with date shifting for templates
 */

/**
 * Duplicate a project with date shifting
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} projectId - Original project ID
 * @param {string} newName - Name for the duplicated project
 * @param {string} organizationId - Organization ID
 * @param {Date|string} newStartDate - New start date for the project
 * @param {{ address?: string, project_number?: string }} [overrides] - Optional address and project number for the copy
 * @param {string} [currentUserId] - Auth user ID of the user performing the duplicate (used for created_by_user_id and project_manager_id)
 * @returns {Promise<{success: boolean, newProjectId?: string, error?: string}>}
 */
export async function duplicateProject(supabase, projectId, newName, organizationId, newStartDate, overrides = {}, currentUserId = null) {
  try {
    const { canCreateProject, isProjectLimitError } = await import('@siteweave/core-logic');
    const allowed = await canCreateProject(supabase, organizationId);
    if (!allowed) {
      return { success: false, error: 'PROJECT_LIMIT_REACHED' };
    }

    // Get original project
    const { data: originalProject, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !originalProject) {
      return { success: false, error: 'Project not found' };
    }

    // Calculate original start date
    // Use created_at as baseline, or earliest task due_date, or project due_date minus estimated duration
    let originalStartDate = new Date(originalProject.created_at);

    // Try to find earliest task due_date
    const { data: tasks } = await supabase
      .from('tasks')
      .select('due_date')
      .eq('project_id', projectId)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true })
      .limit(1);

    if (tasks && tasks.length > 0 && tasks[0].due_date) {
      originalStartDate = new Date(tasks[0].due_date);
    }

    // Calculate date delta
    const newStart = new Date(newStartDate);
    const deltaDays = Math.floor((newStart - originalStartDate) / (1000 * 60 * 60 * 24));

    // Create new project (excluding transactional data)
    const { data: newProject, error: newProjectError } = await supabase
      .from('projects')
      .insert({
        name: newName,
        address: overrides.address !== undefined ? overrides.address : originalProject.address,
        project_number: overrides.project_number !== undefined ? overrides.project_number : originalProject.project_number,
        status: originalProject.status || 'Planning',
        status_color: originalProject.status_color,
        project_type: originalProject.project_type,
        start_date: originalProject.start_date ? shiftDate(originalProject.start_date, deltaDays) : null,
        due_date: originalProject.due_date ? shiftDate(originalProject.due_date, deltaDays) : null,
        next_milestone: originalProject.next_milestone,
        milestones: originalProject.milestones,
        color: originalProject.color,
        organization_id: organizationId,
        created_by_user_id: currentUserId ?? originalProject.created_by_user_id,
        project_manager_id: currentUserId ?? originalProject.project_manager_id
      })
      .select()
      .single();

    if (newProjectError) {
      console.error('Error creating duplicated project:', newProjectError);
      return { success: false, error: newProjectError.message };
    }

    // Duplicate project phases (structure only, reset progress and budget, shift dates)
    const { data: phases } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', projectId)
      .order('order', { ascending: true });

    if (phases && phases.length > 0) {
      const newPhases = phases.map(phase => ({
        project_id: newProject.id,
        name: phase.name,
        progress: 0, // Reset progress
        budget: 0, // Reset budget
        order: phase.order,
        organization_id: organizationId
      }));

      await supabase
        .from('project_phases')
        .insert(newPhases);
    }

    // Duplicate tasks (structure only, mark incomplete, clear assignees, shift dates and schedule fields)
    const { data: tasksToDuplicate } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    let oldTaskIdToNewId = {};
    if (tasksToDuplicate && tasksToDuplicate.length > 0) {
      const newTasks = tasksToDuplicate.map(task => ({
        project_id: newProject.id,
        text: task.text,
        due_date: task.due_date ? shiftDate(task.due_date, deltaDays) : null,
        start_date: task.start_date ? shiftDate(task.start_date, deltaDays) : null,
        duration_days: task.duration_days,
        is_milestone: task.is_milestone ?? false,
        priority: task.priority,
        completed: false,
        assignee_id: null,
        recurrence: task.recurrence,
        organization_id: organizationId
      }));

      const { data: insertedTasks, error: tasksInsertError } = await supabase
        .from('tasks')
        .insert(newTasks)
        .select('id');

      if (tasksInsertError) {
        console.error('Error inserting duplicated tasks:', tasksInsertError);
        return { success: false, error: tasksInsertError.message };
      }
      // Map old task id -> new task id by insert order
      if (insertedTasks && insertedTasks.length === tasksToDuplicate.length) {
        tasksToDuplicate.forEach((t, i) => { oldTaskIdToNewId[t.id] = insertedTasks[i].id; });
      }

      // Copy task_dependencies (remap to new task ids)
      const oldTaskIds = tasksToDuplicate.map(t => t.id);
      const { data: deps } = await supabase
        .from('task_dependencies')
        .select('task_id, successor_task_id, dependency_type, lag_days')
        .in('task_id', oldTaskIds);

      if (deps && deps.length > 0) {
        const newDeps = deps
          .filter(d => oldTaskIdToNewId[d.task_id] && oldTaskIdToNewId[d.successor_task_id])
          .map(d => ({
            task_id: oldTaskIdToNewId[d.task_id],
            successor_task_id: oldTaskIdToNewId[d.successor_task_id],
            dependency_type: d.dependency_type || 'finish_to_start',
            lag_days: d.lag_days ?? 0
          }));
        if (newDeps.length > 0) {
          await supabase.from('task_dependencies').insert(newDeps);
        }
      }
    }

    return {
      success: true,
      newProjectId: newProject.id
    };
  } catch (error) {
    console.error('Error duplicating project:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Shift a date by a number of days
 * @param {Date|string} date - Original date
 * @param {number} days - Number of days to shift (can be negative)
 * @returns {Date} Shifted date
 */
function shiftDate(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0]; // Return as YYYY-MM-DD
}

