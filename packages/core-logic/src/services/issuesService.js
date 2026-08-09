/**
 * Field Issues Service — site triage tracker + punch list closeout.
 */

import { fetchUserInfo } from '../utils/fetchUserInfo.js';
import { uploadFile } from './fileService.js';
import { createStreamPost } from './streamService.js';
import {
  notifyFieldIssueAssigned,
  notifyFieldIssueCreated,
} from './projectCommunicationNotifyService.js';

const ISSUE_PHOTO_BUCKET = 'message_files';

const ISSUE_SELECT = `
  *,
  issue_files!fk_issue_files_issue_id(*),
  issue_comments!fk_issue_comments_issue_id(count)
`;

async function invokeAuthHeaders(supabase) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

function messageFromFunctionsError(error) {
  if (error?.context?.body) {
    try {
      const parsed = typeof error.context.body === 'string'
        ? JSON.parse(error.context.body)
        : error.context.body;
      if (parsed?.error) return parsed.error;
    } catch {
      // ignore
    }
  }
  return error?.message || 'Request failed';
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string|null|undefined} path
 */
export function resolveIssuePhotoUrl(supabase, path) {
  if (!path) return null;
  const { data } = supabase.storage.from(ISSUE_PHOTO_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<object>} issues
 */
export function enrichIssuesWithPhotoUrls(supabase, issues) {
  return (issues || []).map((issue) => ({
    ...issue,
    before_photo_url: resolveIssuePhotoUrl(supabase, issue.before_photo_path),
    after_photo_url: resolveIssuePhotoUrl(supabase, issue.after_photo_path),
  }));
}

/**
 * @param {Array<object>} issues
 * @returns {Array<{ location: string|null, items: Array<object> }>}
 */
export function groupIssuesByLocation(issues) {
  const map = new Map();
  const unlocated = [];
  for (const issue of issues || []) {
    const loc = String(issue.location || '').trim();
    if (loc) {
      if (!map.has(loc)) map.set(loc, []);
      map.get(loc).push(issue);
    } else {
      unlocated.push(issue);
    }
  }
  const groups = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([location, items]) => ({ location, items }));
  if (unlocated.length) {
    groups.push({ location: null, items: unlocated });
  }
  return groups;
}

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
 * @param {string|null|undefined} contactId
 */
async function resolveUserIdForContact(supabase, contactId) {
  if (!contactId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('contact_id', contactId)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

/**
 * Normalize assignee fields for insert/update.
 * Prefers assigned_to_contact_id; fills assigned_to_user_id from profile when missing.
 */
async function normalizeIssueAssigneeFields(supabase, fields = {}) {
  const hasContactKey = Object.prototype.hasOwnProperty.call(fields, 'assigned_to_contact_id');
  const hasUserKey = Object.prototype.hasOwnProperty.call(fields, 'assigned_to_user_id');
  if (!hasContactKey && !hasUserKey) return {};

  let contactId = hasContactKey ? (fields.assigned_to_contact_id || null) : undefined;
  let userId = hasUserKey ? (fields.assigned_to_user_id || null) : undefined;

  if (contactId === null && userId === null) {
    return { assigned_to_contact_id: null, assigned_to_user_id: null };
  }

  if (contactId && (userId === undefined || userId === null)) {
    userId = await resolveUserIdForContact(supabase, contactId);
  }

  if (!contactId && userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('contact_id')
      .eq('id', userId)
      .maybeSingle();
    contactId = profile?.contact_id || null;
  }

  return {
    assigned_to_contact_id: contactId ?? null,
    assigned_to_user_id: userId ?? null,
  };
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
  const contactIds = [
    ...new Set(rows.map((r) => r.assigned_to_contact_id).filter(Boolean)),
  ];
  const userInfo = await fetchUserInfo(supabase, userIds);

  let contactById = {};
  if (contactIds.length > 0) {
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, name, email, phone')
      .in('id', contactIds);
    if (error) throw error;
    contactById = Object.fromEntries((contacts || []).map((c) => [c.id, c]));
  }

  return rows.map((row) => {
    const mapped = mapIssueRow(row);
    const contact = mapped.assigned_to_contact_id
      ? contactById[mapped.assigned_to_contact_id]
      : null;
    const userAssignee = userInfo[mapped.assigned_to_user_id] || null;
    const assignee = contact
      ? {
          id: contact.id,
          name: contact.name || userAssignee?.name || null,
          email: contact.email || userAssignee?.email || null,
          phone: contact.phone || null,
          userId: mapped.assigned_to_user_id || null,
        }
      : userAssignee
        ? { ...userAssignee, userId: mapped.assigned_to_user_id || null }
        : null;
    return {
      ...mapped,
      creator: userInfo[mapped.created_by_user_id] || null,
      assignee,
    };
  });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 * @param {{ statusFilter?: 'all'|'open'|'closed', limit?: number, beforeCreatedAt?: string }} [options]
 * @returns {Promise<{ issues: Array, hasMore: boolean }>}
 */
export async function fetchProjectIssues(supabase, projectId, options = {}) {
  const { statusFilter = 'all' } = options;
  const limit = options.limit ?? 50;
  const beforeCreatedAt = options.beforeCreatedAt ?? null;

  let query = supabase
    .from('project_issues')
    .select(ISSUE_SELECT)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (beforeCreatedAt) {
    query = query.lt('created_at', beforeCreatedAt);
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = (data || []).filter((row) => {
    if (statusFilter === 'all') return true;
    const s = (row.status || '').toLowerCase();
    const closed =
      Boolean(row.resolved_at) ||
      ['closed', 'resolved', 'complete', 'done', 'cancelled'].includes(s);
    return statusFilter === 'closed' ? closed : !closed;
  });

  const issues = await enrichIssues(supabase, rows);
  return { issues: enrichIssuesWithPhotoUrls(supabase, issues), hasMore: (data || []).length === limit };
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
  const [withUrls] = enrichIssuesWithPhotoUrls(supabase, [enriched]);
  return withUrls;
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
    assigned_to_contact_id = null,
    related_task_ids = [],
    location = null,
    before_photo_path = null,
    after_photo_path = null,
    bridgeToStream = true,
    notifyChannels = null,
  } = params;

  const assigneeFields = await normalizeIssueAssigneeFields(supabase, {
    assigned_to_contact_id,
    assigned_to_user_id,
  });

  const insertRow = {
    project_id,
    organization_id,
    title: String(title).trim(),
    description: description || null,
    priority,
    due_date,
    status: 'open',
    created_by_user_id,
    ...assigneeFields,
    related_task_ids: Array.isArray(related_task_ids) ? related_task_ids : [],
    location: location ? String(location).trim() : null,
    before_photo_path: before_photo_path || null,
    after_photo_path: after_photo_path || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('project_issues')
    .insert(insertRow)
    .select(ISSUE_SELECT)
    .single();

  if (error) throw error;
  const [issue] = await enrichIssues(supabase, [data]);
  const [withUrls] = enrichIssuesWithPhotoUrls(supabase, [issue]);

  notifyFieldIssueCreated(supabase, { issueId: issue.id });
  const assigneeUserId = assigneeFields.assigned_to_user_id;
  const hasAssignee =
    Boolean(assigneeFields.assigned_to_contact_id) || Boolean(assigneeUserId);
  if (hasAssignee && assigneeUserId !== created_by_user_id) {
    notifyFieldIssueAssigned(supabase, {
      issueId: issue.id,
      channels: notifyChannels || undefined,
    });
  }

  if (bridgeToStream && created_by_user_id) {
    try {
      await createIssueStreamBridgePost(supabase, {
        issue: withUrls,
        projectId: project_id,
        organizationId: organization_id,
        authorId: created_by_user_id,
        event: 'opened',
      });
    } catch (e) {
      console.warn('createIssueStreamBridgePost', e);
    }
  }

  return withUrls;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} issueId
 * @param {Object} updates
 * @param {{ bridgeToStream?: boolean, previousStatus?: string, notifyChannels?: { email?: boolean, sms?: boolean, app?: boolean } }} [options]
 */
export async function updateProjectIssue(supabase, issueId, updates, options = {}) {
  const patch = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (
    Object.prototype.hasOwnProperty.call(updates, 'assigned_to_contact_id') ||
    Object.prototype.hasOwnProperty.call(updates, 'assigned_to_user_id')
  ) {
    const assigneeFields = await normalizeIssueAssigneeFields(supabase, updates);
    Object.assign(patch, assigneeFields);
  }

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
  const [withUrls] = enrichIssuesWithPhotoUrls(supabase, [issue]);

  if (
    Object.prototype.hasOwnProperty.call(updates, 'assigned_to_contact_id') ||
    Object.prototype.hasOwnProperty.call(updates, 'assigned_to_user_id')
  ) {
    notifyFieldIssueAssigned(supabase, {
      issueId,
      channels: options.notifyChannels || undefined,
    });
  }

  const wasOpen = (options.previousStatus || '').toLowerCase() !== 'closed';
  const nowClosed = (withUrls.status || '').toLowerCase() === 'closed' || withUrls.resolved_at;
  if (options.bridgeToStream !== false && wasOpen && nowClosed && withUrls.created_by_user_id) {
    try {
      await createIssueStreamBridgePost(supabase, {
        issue: withUrls,
        projectId: withUrls.project_id,
        organizationId: withUrls.organization_id,
        authorId: withUrls.created_by_user_id,
        event: 'closed',
      });
    } catch (e) {
      console.warn('createIssueStreamBridgePost', e);
    }
  }

  return withUrls;
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

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 * @param {{ statusFilter?: 'all'|'open'|'closed' }} [options]
 */
export async function fetchProjectIssuesGroupedByLocation(supabase, projectId, options = {}) {
  const { issues } = await fetchProjectIssues(supabase, projectId, options);
  return groupIssuesByLocation(issues);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} params
 */
export async function createWalkthroughIssue(supabase, params) {
  const {
    project_id,
    organization_id,
    location,
    description,
    before_photo_path = null,
    created_by_user_id,
    assigned_to_user_id = null,
    assigned_to_contact_id = null,
    priority = 'Medium',
    due_date = null,
    notifyChannels = null,
  } = params;

  const note = String(description || '').trim();
  const loc = String(location || '').trim();
  const title = loc || 'Punch item';
  const combinedDescription = [loc ? `Location: ${loc}` : null, note || null]
    .filter(Boolean)
    .join('\n');

  return createProjectIssue(supabase, {
    project_id,
    organization_id,
    title,
    description: combinedDescription || null,
    priority,
    due_date,
    created_by_user_id,
    assigned_to_user_id,
    assigned_to_contact_id,
    location: null,
    before_photo_path,
    bridgeToStream: true,
    notifyChannels,
  });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} issueId
 * @param {string} storagePath
 */
export async function setIssueBeforePhotoPath(supabase, issueId, storagePath) {
  return updateProjectIssue(supabase, issueId, { before_photo_path: storagePath || null });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} issueId
 * @param {string} storagePath
 */
export async function setIssueAfterPhotoPath(supabase, issueId, storagePath) {
  return updateProjectIssue(supabase, issueId, { after_photo_path: storagePath || null });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 */
export async function fetchProjectCloseoutState(supabase, projectId) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, punch_list_signed_off_at, punch_list_signed_off_by_name, punch_list_signature')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ projectId: string, organizationId: string }} params
 */
export async function createProjectCloseoutReviewLink(supabase, { projectId, organizationId }) {
  const headers = await invokeAuthHeaders(supabase);
  const { data, error } = await supabase.functions.invoke('create-project-closeout-review', {
    headers,
    body: {
      project_id: projectId,
      organization_id: organizationId,
    },
  });
  if (error) throw new Error(messageFromFunctionsError(error));
  if (data?.error) throw new Error(data.error);
  if (!data?.url) throw new Error('Review link was not returned');
  return { url: data.url, rawToken: data.rawToken || null };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 */
export async function exportPunchListPdf(supabase, projectId) {
  const headers = await invokeAuthHeaders(supabase);
  const { data, error } = await supabase.functions.invoke('export-punch-list-pdf', {
    headers,
    body: { project_id: projectId },
  });
  if (error) throw new Error(messageFromFunctionsError(error));
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Compute whether a project is nearing closeout based on task completion.
 * @param {Array<{ completed?: boolean }>} tasks
 */
export function isProjectCloseoutReady(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) return false;
  const completed = tasks.filter((t) => t.completed).length;
  return completed > 0 && completed / tasks.length >= 0.8;
}

/** @deprecated use createProjectIssue */
export async function createFieldIssue(supabase, issueData) {
  return createProjectIssue(supabase, issueData);
}

/** @deprecated use updateProjectIssue */
export async function updateFieldIssue(supabase, issueId, updates) {
  return updateProjectIssue(supabase, issueId, updates);
}
