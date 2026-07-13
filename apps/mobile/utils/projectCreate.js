import AsyncStorage from '@react-native-async-storage/async-storage';

export const PROJECTS_CREATED_COUNT_KEY = 'siteweave_projects_created_count';

export async function getProjectsCreatedCount() {
  try {
    const raw = await AsyncStorage.getItem(PROJECTS_CREATED_COUNT_KEY);
    const count = parseInt(raw || '0', 10);
    return Number.isFinite(count) ? count : 0;
  } catch {
    return 0;
  }
}

export async function incrementProjectsCreatedCount() {
  try {
    const count = (await getProjectsCreatedCount()) + 1;
    await AsyncStorage.setItem(PROJECTS_CREATED_COUNT_KEY, String(count));
    return count;
  } catch {
    return 0;
  }
}

/** Distinct non-empty addresses from the user's projects, most recent first. */
export function getRecentProjectAddresses(projects = [], limit = 5) {
  const seen = new Set();
  const results = [];
  for (const project of projects) {
    const address = String(project?.address || project?.location || '').trim();
    if (!address) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ id: key, label: address, address });
    if (results.length >= limit) break;
  }
  return results;
}

/** Most recently updated project for duplicate shortcut. */
export function getLastUpdatedProject(projects = []) {
  if (!projects?.length) return null;
  const sorted = [...projects].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
    const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
    return bTime - aTime;
  });
  return sorted[0] || null;
}

export function buildDuplicateProjectValues(project, copySuffix = ' copy') {
  if (!project) return null;
  const baseName = String(project.name || project.title || '').trim();
  return {
    name: baseName ? `${baseName}${copySuffix}` : '',
    address: project.address || project.location || '',
    status: project.status || 'Planning',
    project_type: project.project_type || 'Residential',
    start_date: project.start_date || null,
    due_date: project.due_date || project.end_date || null,
  };
}
