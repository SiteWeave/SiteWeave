import { Image } from 'expo-image';
import { fetchUserProjectsWithProgress, fetchProject, fetchTasksByProject } from '@siteweave/core-logic';
import { filterByOrganizationId } from './orgScope';
import { getCached, setCached } from './persistentCache';

const inflight = new Map();

function dedupe(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const promise = Promise.resolve()
    .then(fn)
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

export function prefetchRemoteImages(urls = []) {
  const unique = [...new Set(urls.filter(Boolean))];
  if (!unique.length) return;
  unique.forEach((uri) => {
    Image.prefetch(uri).catch(() => {});
  });
}

export async function warmProjectsListCache({
  supabase,
  userId,
  organizationId,
}) {
  if (!supabase || !userId) return null;
  const cacheResource = `projects:${organizationId || 'guest'}`;
  return dedupe(`projects:${userId}:${cacheResource}`, async () => {
    const data = await fetchUserProjectsWithProgress(supabase, userId, { limit: 50 });
    const orgProjects = organizationId
      ? filterByOrganizationId(data || [], organizationId)
      : data || [];
    await setCached(userId, cacheResource, orgProjects);
    return orgProjects;
  });
}

export async function warmProjectDetailCache({
  supabase,
  userId,
  projectId,
}) {
  if (!supabase || !userId || !projectId) return null;
  const detailCacheKey = `projectDetail:${projectId}`;
  return dedupe(`detail:${userId}:${projectId}`, async () => {
    const cached = await getCached(userId, detailCacheKey);
    if (cached?.project) return cached;

    const projectData = await fetchProject(supabase, projectId).catch(() => null);
    if (!projectData) return null;

    const [tasks, phasesResult] = await Promise.all([
      fetchTasksByProject(supabase, projectId).catch(() => []),
      supabase
        .from('project_phases')
        .select('*')
        .eq('project_id', projectId)
        .order('order', { ascending: true })
        .then(({ data }) => data || [])
        .catch(() => []),
    ]);

    const payload = {
      project: projectData,
      tasks: tasks || [],
      phases: phasesResult || [],
      scopeOrganizationId: projectData.organization_id || null,
    };
    await setCached(userId, detailCacheKey, payload);
    return payload;
  });
}

/**
 * FlashList / FlatList onScroll helper: fire when scrolled past ~75% depth.
 */
export function shouldPrefetchFromScroll({
  contentOffsetY,
  contentHeight,
  layoutHeight,
  threshold = 0.75,
}) {
  if (!contentHeight || !layoutHeight) return false;
  const maxScroll = Math.max(1, contentHeight - layoutHeight);
  const progress = contentOffsetY / maxScroll;
  return progress >= threshold;
}
