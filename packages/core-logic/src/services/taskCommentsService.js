/**
 * Task Comments Service — task-anchored discussion with public/internal visibility.
 */

import { fetchUserInfo } from '../utils/fetchUserInfo.js';
import { notifyTaskCommentCreated } from './projectCommunicationNotifyService.js';

const COMMENT_BODY_MAX = 4000;

/**
 * Whether the viewer can post internal comments (same org as project).
 * @param {{ organization_id?: string }} viewerProfile
 * @param {{ organization_id?: string }} project
 */
export function canSetInternalVisibility(viewerProfile, project) {
  if (!viewerProfile?.organization_id || !project?.organization_id) return false;
  return viewerProfile.organization_id === project.organization_id;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} taskId
 */
export async function fetchTaskComments(supabase, taskId) {
  const { data, error } = await supabase
    .from('task_comments')
    .select('*')
    .eq('task_id', taskId)
    .is('parent_comment_id', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!data?.length) return [];

  const userIds = [...new Set(data.map((c) => c.author_id).filter(Boolean))];
  const userInfo = await fetchUserInfo(supabase, userIds);

  return data.map((comment) => ({
    ...comment,
    author: userInfo[comment.author_id] || null,
  }));
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} commentData
 */
export async function createTaskComment(supabase, commentData) {
  const body = String(commentData.body || '').trim();
  if (!body) throw new Error('Comment is required');
  if (body.length > COMMENT_BODY_MAX) throw new Error(`Comment must be under ${COMMENT_BODY_MAX} characters`);

  const { data, error } = await supabase
    .from('task_comments')
    .insert({ ...commentData, body })
    .select('*')
    .single();

  if (error) throw error;

  if (data.author_id) {
    const userInfo = await fetchUserInfo(supabase, [data.author_id]);
    data.author = userInfo[data.author_id] || null;
  }

  notifyTaskCommentCreated(supabase, { commentId: data.id });
  return data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} commentId
 * @param {Object} updates
 */
export async function updateTaskComment(supabase, commentId, updates) {
  const patch = { ...updates };
  if (patch.body != null) {
    patch.body = String(patch.body).trim();
    if (!patch.body) throw new Error('Comment is required');
    if (patch.body.length > COMMENT_BODY_MAX) throw new Error(`Comment must be under ${COMMENT_BODY_MAX} characters`);
  }

  const { data, error } = await supabase
    .from('task_comments')
    .update(patch)
    .eq('id', commentId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} commentId
 */
export async function deleteTaskComment(supabase, commentId) {
  const { error } = await supabase.from('task_comments').delete().eq('id', commentId);
  if (error) throw error;
}
