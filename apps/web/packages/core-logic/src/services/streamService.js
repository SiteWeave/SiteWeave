/**
 * Project Stream Service — per-project feed posts and threaded replies.
 */

import { fetchUserInfo } from '../utils/fetchUserInfo.js';
import { notifyStreamPostCreated } from './projectCommunicationNotifyService.js';

const POST_BODY_MAX = 10000;
const REPLY_BODY_MAX = 4000;

export const STREAM_POST_TYPES = [
  { value: 'general', label: 'Update' },
  { value: 'daily_log', label: 'Daily log' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'milestone', label: 'Milestone' },
];

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} post
 * @param {{ reply_count?: number }} [extras]
 */
export async function enrichStreamPost(supabase, post, extras = {}) {
  if (!post) return null;
  const userInfo = post.author_id
    ? await fetchUserInfo(supabase, [post.author_id])
    : {};
  return {
    ...post,
    author: userInfo[post.author_id] || null,
    reply_count: extras.reply_count ?? post.reply_count ?? 0,
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 * @param {string} [sinceIso]
 */
export async function countStreamPostsSince(supabase, projectId, sinceIso) {
  let query = supabase
    .from('project_stream_posts')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (sinceIso) {
    query = query.gt('created_at', sinceIso);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 * @param {{ limit?: number }} [options]
 */
export async function fetchStreamPosts(supabase, projectId, options = {}) {
  const limit = options.limit ?? 50;

  // Fetch posts with reply count embedded via PostgREST aggregate.
  // project_stream_replies(count) is a one-to-many so PostgREST returns
  // the count inline without a secondary round-trip.
  const { data, error } = await supabase
    .from('project_stream_posts')
    .select('*, project_stream_replies(count)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!data?.length) return [];

  const userIds = [...new Set(data.map((p) => p.author_id).filter(Boolean))];
  const userInfo = await fetchUserInfo(supabase, userIds);

  return data.map((post) => {
    const { project_stream_replies: repliesAgg, ...rest } = post;
    return {
      ...rest,
      author: userInfo[post.author_id] || null,
      reply_count: repliesAgg?.[0]?.count ?? 0,
    };
  });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} postId
 */
export async function fetchStreamReplies(supabase, postId) {
  const { data, error } = await supabase
    .from('project_stream_replies')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!data?.length) return [];

  const userIds = [...new Set(data.map((r) => r.author_id).filter(Boolean))];
  const userInfo = await fetchUserInfo(supabase, userIds);

  return data.map((reply) => ({
    ...reply,
    author: userInfo[reply.author_id] || null,
  }));
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} postData
 */
export async function createStreamPost(supabase, postData) {
  const body = String(postData.body || '').trim();
  if (!body) throw new Error('Post body is required');
  if (body.length > POST_BODY_MAX) throw new Error(`Post must be under ${POST_BODY_MAX} characters`);

  const { data, error } = await supabase
    .from('project_stream_posts')
    .insert({ ...postData, body })
    .select('*')
    .single();

  if (error) throw error;
  const enriched = await enrichStreamPost(supabase, data, { reply_count: 0 });
  notifyStreamPostCreated(supabase, { postId: enriched.id });
  return enriched;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} replyData
 */
export async function createStreamReply(supabase, replyData) {
  const body = String(replyData.body || '').trim();
  if (!body) throw new Error('Reply body is required');
  if (body.length > REPLY_BODY_MAX) throw new Error(`Reply must be under ${REPLY_BODY_MAX} characters`);

  const { data, error } = await supabase
    .from('project_stream_replies')
    .insert({ ...replyData, body })
    .select('*')
    .single();

  if (error) throw error;

  const userInfo = data.author_id
    ? await fetchUserInfo(supabase, [data.author_id])
    : {};
  return { ...data, author: userInfo[data.author_id] || null };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} postId
 * @param {Object} updates
 */
export async function updateStreamPost(supabase, postId, updates) {
  const patch = { ...updates };
  if (patch.body != null) {
    patch.body = String(patch.body).trim();
    if (!patch.body) throw new Error('Post body is required');
    if (patch.body.length > POST_BODY_MAX) throw new Error(`Post must be under ${POST_BODY_MAX} characters`);
  }

  const { data, error } = await supabase
    .from('project_stream_posts')
    .update(patch)
    .eq('id', postId)
    .select('*')
    .single();

  if (error) throw error;
  return enrichStreamPost(supabase, data);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} postId
 */
export async function deleteStreamPost(supabase, postId) {
  const { error } = await supabase.from('project_stream_posts').delete().eq('id', postId);
  if (error) throw error;
}
