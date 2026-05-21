/**
 * Project Templates: save project structure as template, create project from template.
 * Structure: { phases: [{ name, order }], tasks: [...], dependencies: [{ predecessor_index, successor_index, dependency_type, lag_days }] }
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 * @param {string} organizationId
 * @param {string} userId
 * @param {string} templateName
 * @param {string} [templateDescription]
 * @returns {Promise<{ success: boolean, templateId?: string, error?: string }>}
 */
export async function saveProjectAsTemplate(supabase, projectId, organizationId, userId, templateName, templateDescription = '') {
  try {
    const [phasesRes, tasksRes] = await Promise.all([
      supabase.from('project_phases').select('name, order').eq('project_id', projectId).order('order', { ascending: true }),
      supabase.from('tasks').select('id, text, due_date, start_date, duration_days, is_milestone, priority').eq('project_id', projectId).order('created_at', { ascending: true })
    ]);
    const phases = phasesRes.data || [];
    const tasks = tasksRes.data || [];
    if (tasks.length === 0) {
      return { success: false, error: 'Project has no tasks to save as template' };
    }
    const taskIds = tasks.map(t => t.id);
    const taskIdToIndex = new Map(taskIds.map((id, i) => [id, i]));
    const { data: deps } = await supabase
      .from('task_dependencies')
      .select('task_id, successor_task_id, dependency_type, lag_days')
      .in('task_id', taskIds);
    const dependencies = (deps || [])
      .filter(d => taskIdToIndex.has(d.task_id) && taskIdToIndex.has(d.successor_task_id))
      .map(d => ({
        predecessor_index: taskIdToIndex.get(d.task_id),
        successor_index: taskIdToIndex.get(d.successor_task_id),
        dependency_type: d.dependency_type || 'finish_to_start',
        lag_days: d.lag_days ?? 0
      }));
    const structure = {
      phases: phases.map(p => ({ name: p.name, order: p.order })),
      tasks: tasks.map(t => ({
        text: t.text,
        due_date: t.due_date,
        start_date: t.start_date,
        duration_days: t.duration_days,
        is_milestone: t.is_milestone ?? false,
        priority: t.priority
      })),
      dependencies
    };
    const { data: template, error } = await supabase
      .from('project_templates')
      .insert({
        organization_id: organizationId,
        name: templateName,
        description: templateDescription || null,
        created_by_user_id: userId,
        structure
      })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, templateId: template.id };
  } catch (e) {
    console.error('saveProjectAsTemplate', e);
    return { success: false, error: e.message };
  }
}

/**
 * @param {Date|string} date
 * @param {number} days
 * @returns {string} YYYY-MM-DD
 */
function shiftDate(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} templateId
 * @param {string} organizationId
 * @param {string} userId
 * @param {string} projectName
 * @param {string} [address]
 * @param {string} [projectNumber]
 * @param {Date|string} startDate
 * @returns {Promise<{ success: boolean, projectId?: string, error?: string }>}
 */
export async function createProjectFromTemplate(supabase, templateId, organizationId, userId, projectName, address, projectNumber, startDate) {
  try {
    const { canCreateProject } = await import('@siteweave/core-logic');
    const allowed = await canCreateProject(supabase, organizationId);
    if (!allowed) return { success: false, error: 'PROJECT_LIMIT_REACHED' };

    const { data: template, error: tErr } = await supabase
      .from('project_templates')
      .select('structure')
      .eq('id', templateId)
      .single();
    if (tErr || !template) return { success: false, error: 'Template not found' };
    const { phases = [], tasks = [], dependencies = [] } = template.structure || {};
    if (!tasks.length) return { success: false, error: 'Template has no tasks' };

    let referenceStart = null;
    for (const t of tasks) {
      const d = t.start_date || t.due_date;
      if (d) {
        const dt = new Date(d);
        if (!referenceStart || dt < referenceStart) referenceStart = dt;
      }
    }
    if (!referenceStart) referenceStart = new Date(startDate);
    const newStart = new Date(startDate);
    const deltaDays = Math.floor((newStart - referenceStart) / (1000 * 60 * 60 * 24));

    const { data: newProject, error: pErr } = await supabase
      .from('projects')
      .insert({
        name: projectName,
        address: address || null,
        project_number: projectNumber || null,
        status: 'Planning',
        organization_id: organizationId,
        created_by_user_id: userId
      })
      .select('id')
      .single();
    if (pErr) return { success: false, error: pErr.message };

    if (phases.length > 0) {
      const { error: phasesErr } = await supabase.from('project_phases').insert(phases.map(p => ({
        project_id: newProject.id,
        name: p.name,
        order: p.order,
        progress: 0,
        budget: 0,
        organization_id: organizationId
      })));
      if (phasesErr) return { success: false, error: phasesErr.message };
    }

    const newTasksPayload = tasks.map(t => ({
      project_id: newProject.id,
      text: t.text,
      due_date: t.due_date ? shiftDate(t.due_date, deltaDays) : null,
      start_date: t.start_date ? shiftDate(t.start_date, deltaDays) : null,
      duration_days: t.duration_days,
      is_milestone: t.is_milestone ?? false,
      priority: t.priority,
      completed: false,
      organization_id: organizationId
    }));
    const { data: insertedTasks, error: tasksErr } = await supabase
      .from('tasks')
      .insert(newTasksPayload)
      .select('id');
    if (tasksErr) return { success: false, error: tasksErr.message };
    const indexToNewId = (insertedTasks || []).reduce((acc, row, i) => { acc[i] = row.id; return acc; }, {});

    if (dependencies.length > 0) {
      const newDeps = dependencies
        .filter(d => indexToNewId[d.predecessor_index] != null && indexToNewId[d.successor_index] != null)
        .map(d => ({
          task_id: indexToNewId[d.predecessor_index],
          successor_task_id: indexToNewId[d.successor_index],
          dependency_type: d.dependency_type || 'finish_to_start',
          lag_days: d.lag_days ?? 0
        }));
      if (newDeps.length > 0) await supabase.from('task_dependencies').insert(newDeps);
    }

    return { success: true, projectId: newProject.id };
  } catch (e) {
    console.error('createProjectFromTemplate', e);
    return { success: false, error: e.message };
  }
}
