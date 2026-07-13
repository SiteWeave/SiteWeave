/**
 * Mirrors task photo RLS: any org member or guest collaborator may attach photos.
 */
export function canManageTaskPhotos({ userId, task }) {
  if (!userId || !task?.id || !task?.project_id) return false;
  return true;
}
