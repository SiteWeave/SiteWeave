/**
 * Mirrors `public.can_manage_task` / task RLS: assignee, project PM, or org role name `Admin`.
 * For new tasks before insert, pass `assigneeContactId` (selected assignee) instead of `task`.
 */
export function canManageTaskPhotos({
  project,
  userId,
  userContactId,
  userRoleName,
  canEditTasks = false,
  task,
  assigneeContactId,
}) {
  if (!userId || !project) return false;
  if (canEditTasks) return true;
  if (project.project_manager_id && userId === project.project_manager_id) return true;
  if (userRoleName === 'Admin') return true;
  const assignee = task?.assignee_id ?? assigneeContactId ?? null;
  if (userContactId && assignee && userContactId === assignee) return true;
  return false;
}
