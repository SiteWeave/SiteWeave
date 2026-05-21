/**

 * Field Issues Service — site triage tracker (not multi-step workflows).

 */



import { fetchUserInfo } from '../utils/fetchUserInfo.js';

import { uploadFile } from './fileService.js';

import { createStreamPost } from './streamService.js';

import {

  notifyFieldIssueAssigned,

  notifyFieldIssueCreated,

} from './projectCommunicationNotifyService.js';



const ISSUE_SELECT = `

  *,

  issue_files!fk_issue_files_issue_id(*),

  issue_comments!fk_issue_comments_issue_id(count)

`;



/**

 * @param {object} row

 */

function mapIssueRow(row) {

  if (!row) return row;

  const { issue_comments: commentsAgg, ...rest } = row;

  const comment_count = commentsAgg?.[0]?.count ?? row.comment_count ?? 0;

  return { ...rest, comment_count };

}



/**

 * @param {import('@supabase/supabase-js').SupabaseClient} supabase

 * @param {Array<object>} rows

 */

async function enrichIssues(supabase, rows) {

  if (!rows?.length) return [];

  const userIds = [

    ...new Set(

      rows.flatMap((r) => [r.created_by_user_id, r.assigned_to_user_id].filter(Boolean)),

    ),

  ];

  const userInfo = await fetchUserInfo(supabase, userIds);

  return rows.map((row) => {

    const mapped = mapIssueRow(row);

    return {

      ...mapped,

      creator: userInfo[mapped.created_by_user_id] || null,

      assignee: userInfo[mapped.assigned_to_user_id] || null,

    };

  });

}



/**

 * @param {import('@supabase/supabase-js').SupabaseClient} supabase

 * @param {string} projectId

 * @param {{ statusFilter?: 'all'|'open'|'closed' }} [options]

 */

export async function fetchProjectIssues(supabase, projectId, options = {}) {

  const { statusFilter = 'all' } = options;



  const { data, error } = await supabase

    .from('project_issues')

    .select(ISSUE_SELECT)

    .eq('project_id', projectId)

    .order('created_at', { ascending: false });



  if (error) throw error;



  const rows = (data || []).filter((row) => {

    if (statusFilter === 'all') return true;

    const s = (row.status || '').toLowerCase();

    const closed =

      Boolean(row.resolved_at) ||

      ['closed', 'resolved', 'complete', 'done', 'cancelled'].includes(s);

    return statusFilter === 'closed' ? closed : !closed;

  });



  return enrichIssues(supabase, rows);

}



/**

 * @param {import('@supabase/supabase-js').SupabaseClient} supabase

 * @param {number} issueId

 */

export async function fetchProjectIssueById(supabase, issueId) {

  const { data, error } = await supabase

    .from('project_issues')

    .select(ISSUE_SELECT)

    .eq('id', issueId)

    .single();



  if (error) throw error;

  const [enriched] = await enrichIssues(supabase, [data]);

  return enriched;

}



/**

 * @param {import('@supabase/supabase-js').SupabaseClient} supabase

 * @param {string} userId

 */

export async function fetchUserIssues(supabase, userId) {

  const { data, error } = await supabase

    .from('project_issues')

    .select(`${ISSUE_SELECT}, projects:project_id(id, name)`)

    .eq('assigned_to_user_id', userId)

    .order('created_at', { ascending: false });



  if (error) throw error;



  const openRows = (data || []).filter((row) => {

    const s = (row.status || '').toLowerCase();

    return !row.resolved_at && !['closed', 'resolved', 'complete', 'done', 'cancelled'].includes(s);

  });



  return enrichIssues(supabase, openRows);

}



/**

 * @param {import('@supabase/supabase-js').SupabaseClient} supabase

 * @param {Object} params

 */

export async function createProjectIssue(supabase, params) {

  const {

    project_id,

    organization_id,

    title,

    description,

    priority = 'Medium',

    due_date = null,

    created_by_user_id,

    assigned_to_user_id = null,

    related_task_ids = [],

    bridgeToStream = true,

  } = params;



  const insertRow = {

    project_id,

    organization_id,

    title: String(title).trim(),

    description: description || null,

    priority,

    due_date,

    status: 'open',

    created_by_user_id,

    assigned_to_user_id,

    related_task_ids: Array.isArray(related_task_ids) ? related_task_ids : [],

    updated_at: new Date().toISOString(),

  };



  const { data, error } = await supabase

    .from('project_issues')

    .insert(insertRow)

    .select(ISSUE_SELECT)

    .single();



  if (error) throw error;

  const [issue] = await enrichIssues(supabase, [data]);



  notifyFieldIssueCreated(supabase, { issueId: issue.id });

  if (assigned_to_user_id && assigned_to_user_id !== created_by_user_id) {

    notifyFieldIssueAssigned(supabase, { issueId: issue.id });

  }



  if (bridgeToStream && created_by_user_id) {

    try {

      await createIssueStreamBridgePost(supabase, {

        issue,

        projectId: project_id,

        organizationId: organization_id,

        authorId: created_by_user_id,

        event: 'opened',

      });

    } catch (e) {

      console.warn('createIssueStreamBridgePost', e);

    }

  }



  return issue;

}



/**

 * @param {import('@supabase/supabase-js').SupabaseClient} supabase

 * @param {number} issueId

 * @param {Object} updates

 * @param {{ bridgeToStream?: boolean, previousStatus?: string }} [options]

 */

export async function updateProjectIssue(supabase, issueId, updates, options = {}) {

  const patch = {

    ...updates,

    updated_at: new Date().toISOString(),

  };



  if (patch.status === 'closed' && !patch.resolved_at) {

    patch.resolved_at = new Date().toISOString();

  }

  if (patch.status === 'open') {

    patch.resolved_at = null;

  }



  const { data, error } = await supabase

    .from('project_issues')

    .update(patch)

    .eq('id', issueId)

    .select(ISSUE_SELECT)

    .single();



  if (error) throw error;

  const [issue] = await enrichIssues(supabase, [data]);



  if (updates.assigned_to_user_id != null) {

    notifyFieldIssueAssigned(supabase, { issueId });

  }



  const wasOpen = (options.previousStatus || '').toLowerCase() !== 'closed';

  const nowClosed = (issue.status || '').toLowerCase() === 'closed' || issue.resolved_at;

  if (options.bridgeToStream !== false && wasOpen && nowClosed && issue.created_by_user_id) {

    try {

      await createIssueStreamBridgePost(supabase, {

        issue,

        projectId: issue.project_id,

        organizationId: issue.organization_id,

        authorId: issue.created_by_user_id,

        event: 'closed',

      });

    } catch (e) {

      console.warn('createIssueStreamBridgePost', e);

    }

  }



  return issue;

}



/**

 * @param {import('@supabase/supabase-js').SupabaseClient} supabase

 * @param {number} issueId

 */

export async function deleteProjectIssue(supabase, issueId) {

  const { error } = await supabase.from('project_issues').delete().eq('id', issueId);

  if (error) throw error;

}



/**

 * @param {import('@supabase/supabase-js').SupabaseClient} supabase

 * @param {number} issueId

 * @param {File} file

 * @param {string} userId

 */

export async function uploadIssueFile(supabase, issueId, file, userId, organizationId) {

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

  const path = `field-issues/${issueId}/${Date.now()}_${safeName}`;

  const uploaded = await uploadFile(supabase, 'message_files', path, file);



  const { data, error } = await supabase

    .from('issue_files')

    .insert({

      issue_id: issueId,

      organization_id: organizationId,

      file_name: file.name,

      file_url: uploaded.publicUrl,

      file_type: file.type || null,

      file_size_kb: Math.ceil(file.size / 1024),

      uploaded_by_user_id: userId,

    })

    .select('*')

    .single();



  if (error) throw error;

  return data;

}



/**

 * @param {import('@supabase/supabase-js').SupabaseClient} supabase

 * @param {Object} params

 */

export async function createIssueStreamBridgePost(supabase, params) {

  const { issue, projectId, organizationId, authorId, event } = params;

  const verb = event === 'closed' ? 'closed' : 'opened';

  const body = `Field issue ${verb}: ${issue.title}`;



  return createStreamPost(supabase, {

    project_id: projectId,

    organization_id: organizationId,

    author_id: authorId,

    post_type: 'general',

    title: null,

    body,

    payload: { issue_id: issue.id, bridge: true },

  });

}



/**

 * Subscribe to project issue changes.

 * @param {import('@supabase/supabase-js').SupabaseClient} supabase

 * @param {string} projectId

 * @param {() => void} onChange

 */

export function subscribeProjectIssues(supabase, projectId, onChange) {

  const channel = supabase

    .channel(`project_issues:${projectId}`)

    .on(

      'postgres_changes',

      { event: '*', schema: 'public', table: 'project_issues', filter: `project_id=eq.${projectId}` },

      () => onChange(),

    )

    .on(

      'postgres_changes',

      { event: '*', schema: 'public', table: 'issue_comments' },

      () => onChange(),

    )

    .subscribe();



  return () => supabase.removeChannel(channel);

}



/** @deprecated use createProjectIssue */

export async function createFieldIssue(supabase, issueData) {

  return createProjectIssue(supabase, issueData);

}



/** @deprecated use updateProjectIssue */

export async function updateFieldIssue(supabase, issueId, updates) {

  return updateProjectIssue(supabase, issueId, updates);

}


