/**
 * Issue Comments Service — discussion on field issues.
 */

import { fetchUserInfo } from '../utils/fetchUserInfo.js';
import { notifyIssueCommentCreated } from './projectCommunicationNotifyService.js';

const COMMENT_BODY_MAX = 4000;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} issueId
 */
export async function fetchIssueComments(supabase, issueId) {
  const { data, error } = await supabase
    .from('issue_comments')
    .select('*')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!data?.length) return [];

  const userIds = [...new Set(data.map((c) => c.user_id).filter(Boolean))];
  const userInfo = await fetchUserInfo(supabase, userIds);

  return data.map((comment) => ({
    ...comment,
    author: userInfo[comment.user_id] || {
      id: comment.user_id,
      name: comment.user_name,
      avatar_url: null,
    },
  }));
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} commentData
 */
export async function createIssueComment(supabase, commentData) {
  const comment = String(commentData.comment || commentData.body || '').trim();
  if (!comment) throw new Error('Comment is required');
  if (comment.length > COMMENT_BODY_MAX) {
    throw new Error(`Comment must be under ${COMMENT_BODY_MAX} characters`);
  }

  const { data, error } = await supabase
    .from('issue_comments')
    .insert({
      issue_id: commentData.issue_id,
      organization_id: commentData.organization_id,
      user_id: commentData.user_id,
      user_name: commentData.user_name,
      comment,
      comment_type: commentData.comment_type || 'comment',
      step_id: commentData.step_id || null,
    })
    .select('*')
    .single();

  if (error) throw error;

  if (data.user_id) {
    const userInfo = await fetchUserInfo(supabase, [data.user_id]);
    data.author = userInfo[data.user_id] || { id: data.user_id, name: data.user_name };
  }

  notifyIssueCommentCreated(supabase, { commentId: data.id });
  return data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} commentId
 * @param {Object} updates
 */
export async function updateIssueComment(supabase, commentId, updates) {
  const patch = { ...updates };
  if (patch.comment != null) {
    patch.comment = String(patch.comment).trim();
    if (!patch.comment) throw new Error('Comment is required');
  }

  const { data, error } = await supabase
    .from('issue_comments')
    .update(patch)
    .eq('id', commentId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} commentId
 */
export async function deleteIssueComment(supabase, commentId) {
  const { error } = await supabase.from('issue_comments').delete().eq('id', commentId);
  if (error) throw error;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 * @param {string} [sinceIso]
 */
export async function countIssueActivitySince(supabase, projectId, sinceIso) {
  let issuesQuery = supabase
    .from('project_issues')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);

  if (sinceIso) {
    issuesQuery = issuesQuery.gt('updated_at', sinceIso);
  }

  const { count: issueCount, error: issueErr } = await issuesQuery;
  if (issueErr) throw issueErr;

  const { data: issueIds, error: idsErr } = await supabase
    .from('project_issues')
    .select('id')
    .eq('project_id', projectId);

  if (idsErr) throw idsErr;

  const ids = (issueIds || []).map((r) => r.id);
  if (!ids.length) return issueCount ?? 0;

  let commentsQuery = supabase
    .from('issue_comments')
    .select('id', { count: 'exact', head: true })
    .in('issue_id', ids);

  if (sinceIso) {
    commentsQuery = commentsQuery.gt('created_at', sinceIso);
  }

  const { count: commentCount, error: commentErr } = await commentsQuery;
  if (commentErr) throw commentErr;

  return (issueCount ?? 0) + (commentCount ?? 0);
}
