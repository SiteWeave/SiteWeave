import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  buildAppProjectUrl,
  getProjectRecipients,
  insertUserNotifications,
  resolveMentionedRecipients,
  sendExpoPush,
  type ProjectRecipient,
} from '../_shared/projectCommunicationNotify.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const STREAM_TYPE_LABELS: Record<string, string> = {
  general: 'Update',
  daily_log: 'Daily log',
  announcement: 'Announcement',
  milestone: 'Milestone',
}

async function loadPushTokens(supabase: ReturnType<typeof createClient>, userIds: string[]) {
  if (!userIds.length) return []
  const { data } = await supabase
    .from('profiles')
    .select('id, push_token')
    .in('id', userIds)
    .not('push_token', 'is', null)
  return (data || []).map((p) => p.push_token).filter(Boolean) as string[]
}

function dedupeRecipients(list: ProjectRecipient[]): ProjectRecipient[] {
  const map = new Map<string, ProjectRecipient>()
  list.forEach((r) => map.set(r.userId, r))
  return [...map.values()]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
    const supabase = createClient(supabaseUrl, serviceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const body = await req.json()
    const action = body?.action as string

    if (action === 'stream_post') {
      const postId = body?.postId as string
      if (!postId) {
        return new Response(JSON.stringify({ error: 'postId required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const { data: post, error: postError } = await supabase
        .from('project_stream_posts')
        .select('id, project_id, organization_id, author_id, post_type, title, body')
        .eq('id', postId)
        .single()

      if (postError || !post) {
        return new Response(JSON.stringify({ error: 'Post not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      if (post.author_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', post.project_id)
        .single()

      const recipients = await getProjectRecipients(supabase, post.project_id, {
        excludeUserId: user.id,
      })

      const typeLabel = STREAM_TYPE_LABELS[post.post_type] || 'Update'
      const preview = post.title || (post.body || '').slice(0, 120)
      const projectName = project?.name || 'Project'
      const actionUrl = buildAppProjectUrl(post.project_id, 'stream')

      const notifRows = recipients.map((r) => ({
        organization_id: post.organization_id,
        project_id: post.project_id,
        recipient_user_id: r.userId,
        recipient_email: r.email,
        source_type: 'stream_post',
        source_id: post.id,
        title: `${typeLabel} · ${projectName}`,
        body: preview,
        metadata: {
          action_url: actionUrl,
          post_type: post.post_type,
          screen: `/projects/${post.project_id}/stream`,
          project_id: post.project_id,
        },
      }))

      await insertUserNotifications(supabase, notifRows)

      const pushTokens = await loadPushTokens(supabase, recipients.map((r) => r.userId))
      await sendExpoPush(pushTokens, {
        title: `${typeLabel} · ${projectName}`,
        body: preview,
        data: {
          project_id: post.project_id,
          screen: `/projects/${post.project_id}/stream`,
          source_type: 'stream_post',
        },
      })

      return new Response(
        JSON.stringify({ success: true, notified: recipients.length }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    if (action === 'task_comment') {
      const commentId = body?.commentId as string
      if (!commentId) {
        return new Response(JSON.stringify({ error: 'commentId required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const { data: comment, error: commentError } = await supabase
        .from('task_comments')
        .select('id, task_id, project_id, organization_id, author_id, body, visibility')
        .eq('id', commentId)
        .single()

      if (commentError || !comment) {
        return new Response(JSON.stringify({ error: 'Comment not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      if (comment.author_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const { data: task } = await supabase
        .from('tasks')
        .select('text')
        .eq('id', comment.task_id)
        .single()

      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', comment.project_id)
        .single()

      const orgOnly = comment.visibility === 'internal'
      let recipients = await getProjectRecipients(supabase, comment.project_id, {
        excludeUserId: user.id,
        orgMembersOnly: orgOnly,
      })

      const mentioned = await resolveMentionedRecipients(
        supabase,
        comment.project_id,
        comment.body,
        comment.organization_id,
      )

      const taskLabel = task?.text ? `"${task.text.slice(0, 60)}"` : 'a task'
      const projectName = project?.name || 'Project'
      const preview = (comment.body || '').slice(0, 120)
      const actionUrl = buildAppProjectUrl(comment.project_id, 'tasks')

      const baseRows = recipients.map((r) => ({
        organization_id: comment.organization_id,
        project_id: comment.project_id,
        recipient_user_id: r.userId,
        recipient_email: r.email,
        source_type: 'task_comment',
        source_id: comment.id,
        title: orgOnly ? `Internal note · ${projectName}` : `Task comment · ${projectName}`,
        body: `${taskLabel}: ${preview}`,
        metadata: {
          action_url: actionUrl,
          task_id: comment.task_id,
          comment_id: comment.id,
          visibility: comment.visibility,
          screen: `/projects/${comment.project_id}/tasks`,
          project_id: comment.project_id,
        },
      }))

      await insertUserNotifications(supabase, baseRows)

      const mentionTargets = mentioned.filter((m) => m.userId !== user.id)
      if (mentionTargets.length) {
        await insertUserNotifications(
          supabase,
          mentionTargets.map((r) => ({
            organization_id: comment.organization_id,
            project_id: comment.project_id,
            recipient_user_id: r.userId,
            recipient_email: r.email,
            source_type: 'task_comment_mention',
            source_id: comment.id,
            title: `You were mentioned · ${projectName}`,
            body: preview,
            metadata: {
              action_url: actionUrl,
              task_id: comment.task_id,
              comment_id: comment.id,
              screen: `/projects/${comment.project_id}/tasks`,
              project_id: comment.project_id,
            },
          })),
        )
      }

      const pushRecipients = dedupeRecipients([...recipients, ...mentionTargets])
      const pushTokens = await loadPushTokens(supabase, pushRecipients.map((r) => r.userId))
      await sendExpoPush(pushTokens, {
        title: orgOnly ? `Internal note · ${projectName}` : `Task comment · ${projectName}`,
        body: preview,
        data: {
          project_id: comment.project_id,
          task_id: comment.task_id,
          screen: `/projects/${comment.project_id}/tasks`,
          source_type: 'task_comment',
        },
      })

      return new Response(
        JSON.stringify({ success: true, notified: recipients.length }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
