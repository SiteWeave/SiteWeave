/**
 * Sort projects for dashboard display: most recently updated first.
 * @param {Array<{ updated_at?: string, created_at?: string }>} projects
 * @returns {typeof projects}
 */
export function sortProjectsByRecency(projects) {
  if (!Array.isArray(projects)) return projects;
  return [...projects].sort((a, b) => {
    const aTime = new Date(a?.updated_at || a?.created_at || 0).getTime();
    const bTime = new Date(b?.updated_at || b?.created_at || 0).getTime();
    return bTime - aTime;
  });
}
