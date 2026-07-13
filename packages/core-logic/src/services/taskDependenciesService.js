/**
 * Task dependency CRUD and summaries for mobile / shared clients.
 */

export async function fetchTaskDependenciesForProject(supabase, projectId) {
  if (!projectId) return [];
  const { data: tasks, error: taskErr } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', projectId);
  if (taskErr) throw taskErr;
  const ids = (tasks || []).map((t) => t.id).filter(Boolean);
  if (!ids.length) return [];

  const [{ data: d1, error: e1 }, { data: d2, error: e2 }] = await Promise.all([
    supabase
      .from('task_dependencies')
      .select('id, task_id, successor_task_id, dependency_type, lag_days')
      .in('task_id', ids),
    supabase
      .from('task_dependencies')
      .select('id, task_id, successor_task_id, dependency_type, lag_days')
      .in('successor_task_id', ids),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const seen = new Set();
  const merged = [];
  for (const row of [...(d1 || []), ...(d2 || [])]) {
    const key = `${row.task_id}|${row.successor_task_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
}

export async function fetchTaskDependencyNeighborhood(supabase, taskId, projectId) {
  const all = await fetchTaskDependenciesForProject(supabase, projectId);
  const predecessors = all.filter((d) => d.successor_task_id === taskId);
  const successors = all.filter((d) => d.task_id === taskId);
  return { predecessors, successors, all };
}

export async function addTaskDependency(supabase, { taskId, successorTaskId, dependencyType = 'finish_to_start', lagDays = 0 }) {
  if (!taskId || !successorTaskId || taskId === successorTaskId) {
    throw new Error('Invalid dependency');
  }
  const { data, error } = await supabase
    .from('task_dependencies')
    .insert({
      task_id: taskId,
      successor_task_id: successorTaskId,
      dependency_type: dependencyType,
      lag_days: lagDays,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeTaskDependency(supabase, dependencyId) {
  const { error } = await supabase.from('task_dependencies').delete().eq('id', dependencyId);
  if (error) throw error;
}
