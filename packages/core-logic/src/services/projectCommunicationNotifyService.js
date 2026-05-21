/**
 * Client helpers to fan out stream/task notifications via edge function.
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ postId: string }} params
 */
export async function notifyStreamPostCreated(supabase, { postId }) {
  if (!postId) return
  try {
    await supabase.functions.invoke('notify-project-communication', {
      body: { action: 'stream_post', postId },
    })
  } catch (e) {
    console.warn('notifyStreamPostCreated', e)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ commentId: string }} params
 */
export async function notifyTaskCommentCreated(supabase, { commentId }) {
  if (!commentId) return
  try {
    await supabase.functions.invoke('notify-project-communication', {
      body: { action: 'task_comment', commentId },
    })
  } catch (e) {
    console.warn('notifyTaskCommentCreated', e)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ issueId: number }} params
 */
export async function notifyFieldIssueCreated(supabase, { issueId }) {
  if (!issueId) return
  try {
    await supabase.functions.invoke('notify-project-communication', {
      body: { action: 'field_issue_created', issueId },
    })
  } catch (e) {
    console.warn('notifyFieldIssueCreated', e)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ issueId: number }} params
 */
export async function notifyFieldIssueAssigned(supabase, { issueId }) {
  if (!issueId) return
  try {
    await supabase.functions.invoke('notify-project-communication', {
      body: { action: 'field_issue_assigned', issueId },
    })
  } catch (e) {
    console.warn('notifyFieldIssueAssigned', e)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ commentId: number }} params
 */
export async function notifyIssueCommentCreated(supabase, { commentId }) {
  if (!commentId) return
  try {
    await supabase.functions.invoke('notify-project-communication', {
      body: { action: 'issue_comment', commentId },
    })
  } catch (e) {
    console.warn('notifyIssueCommentCreated', e)
  }
}

/**
 * Parse @mentions from comment body (for UI hints).
 * @param {string} body
 */
export function parseMentionTokens(body) {
  if (!body) return []
  const tokens = []
  const seen = new Set()

  const emailRe = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
  let m
  while ((m = emailRe.exec(body)) !== null) {
    const value = m[1].toLowerCase()
    const key = `email:${value}`
    if (!seen.has(key)) {
      seen.add(key)
      tokens.push({ type: 'email', value })
    }
  }

  const handleRe = /@([A-Za-z][A-Za-z0-9._-]{0,40})/g
  while ((m = handleRe.exec(body)) !== null) {
    const value = m[1]
    if (value.includes('@')) continue
    const key = `handle:${value.toLowerCase()}`
    if (!seen.has(key)) {
      seen.add(key)
      tokens.push({ type: 'handle', value })
    }
  }

  return tokens
}
