import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { createServiceClient } from '../_shared/auth.ts'
import {
  buildAppProjectUrl,
  getProjectRecipients,
  insertUserNotifications,
  resolveMentionedRecipients,
  sendExpoPush,
  type ProjectRecipient,
} from '../_shared/projectCommunicationNotify.ts'
import { buildMinimalDigestEmail } from '../_shared/notificationEmailTemplates.ts'
import { sendTransactionalEmail } from '../_shared/transactionalEmailLayout.ts'
import { sendSms } from '../_shared/signalHouseSms.ts'
import { normalizeAssigneePhone } from '../_shared/phone.ts'
import { gateOrSendOptInForSubstantiveSms } from '../_shared/smsConsent.ts'
import { withTransactionalSmsFooter } from '../_shared/smsCompliance.ts'
import { isSmsNotificationsEnabled } from '../_shared/smsNotifications.ts'

type NotifyChannels = { email: boolean; sms: boolean; app: boolean }

function parseNotifyChannels(raw: unknown): NotifyChannels {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    email: obj.email !== false,
    app: obj.app !== false,
    sms: obj.sms === true,
  }
}

async function resolveAssigneeContact(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ email: string | null; phone: string | null; name: string | null }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, contact_id, contacts:contact_id(name, email, phone)')
    .eq('id', userId)
    .maybeSingle()

  const contactRaw = profile?.contacts
  const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw
  let email = contact?.email ? String(contact.email).trim().toLowerCase() : null
  const phone = contact?.phone ? String(contact.phone).trim() : null
  const name = contact?.name ? String(contact.name).trim() : null

  if (!email) {
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId)
    email = authUser?.email ? authUser.email.toLowerCase() : null
  }

  return { email, phone, name }
}

async function resolveActorDisplayName(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('contacts:contact_id(name)')
    .eq('id', userId)
    .maybeSingle()
  const contactRaw = profile?.contacts
  const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw
  const name = contact?.name ? String(contact.name).trim() : ''
  if (name) return name
  const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId)
  return authUser?.email || 'A teammate'
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const STREAM_TYPE_LABELS: Record<string, string> = {
  general: 'Update',
  daily_log: 'Daily log',
}

async function loadPushTokens(supabase: SupabaseClient, userIds: string[]) {
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
    const supabase = createServiceClient()

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
      const actionUrl = buildAppProjectUrl(post.project_id, 'updates')

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
          screen: `/projects/${post.project_id}/updates`,
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
          screen: `/projects/${post.project_id}/updates`,
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

      const recipients = await getProjectRecipients(supabase, comment.project_id, {
        excludeUserId: user.id,
      });

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
        title: `Task comment · ${projectName}`,
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
        title: `Task comment · ${projectName}`,
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

    if (action === 'field_issue_created' || action === 'field_issue_assigned') {
      const issueId = body?.issueId as number
      if (!issueId) {
        return new Response(JSON.stringify({ error: 'issueId required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const channels =
        action === 'field_issue_assigned'
          ? parseNotifyChannels(body?.channels)
          : { email: false, sms: false, app: true }

      const { data: issue, error: issueError } = await supabase
        .from('project_issues')
        .select('id, project_id, organization_id, title, priority, assigned_to_user_id, created_by_user_id')
        .eq('id', issueId)
        .single()

      if (issueError || !issue) {
        return new Response(JSON.stringify({ error: 'Issue not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const { data: project } = await supabase
        .from('projects')
        .select('name, address')
        .eq('id', issue.project_id)
        .single()

      const projectName = project?.name || 'Project'
      const actionUrl = buildAppProjectUrl(issue.project_id, 'updates')

      const allRecipients = await getProjectRecipients(supabase, issue.project_id, {})
      let recipients: ProjectRecipient[] = []
      let assigneeContact: { email: string | null; phone: string | null; name: string | null } | null = null

      if (action === 'field_issue_assigned' && issue.assigned_to_user_id) {
        if (issue.assigned_to_user_id !== user.id) {
          recipients = allRecipients.filter((r) => r.userId === issue.assigned_to_user_id)
          if (!recipients.length) {
            assigneeContact = await resolveAssigneeContact(supabase, issue.assigned_to_user_id)
            if (assigneeContact.email) {
              recipients = [{ userId: issue.assigned_to_user_id, email: assigneeContact.email }]
            }
          }
        }
      } else {
        recipients = allRecipients.filter((r) => r.userId !== user.id)
      }

      const title =
        action === 'field_issue_assigned'
          ? `Assigned to you · ${projectName}`
          : `New field issue · ${projectName}`

      let emailDelivered = false
      let smsDelivered = false
      let smsOptInSent = false

      if (channels.app && recipients.length) {
        const notifRows = recipients.map((r) => ({
          organization_id: issue.organization_id,
          project_id: issue.project_id,
          recipient_user_id: r.userId,
          recipient_email: r.email,
          source_type: action,
          source_id: String(issue.id),
          title,
          body: issue.title,
          metadata: {
            action_url: actionUrl,
            issue_id: issue.id,
            screen: `/projects/${issue.project_id}/updates`,
            project_id: issue.project_id,
            channels: {
              email: channels.email,
              sms: channels.sms,
              app: true,
            },
          },
        }))

        await insertUserNotifications(supabase, notifRows)

        const pushTokens = await loadPushTokens(supabase, recipients.map((r) => r.userId))
        await sendExpoPush(pushTokens, {
          title,
          body: issue.title,
          data: {
            project_id: issue.project_id,
            issue_id: issue.id,
            screen: `/projects/${issue.project_id}/updates`,
            source_type: action,
          },
        })
      }

      if (
        action === 'field_issue_assigned' &&
        issue.assigned_to_user_id &&
        issue.assigned_to_user_id !== user.id &&
        (channels.email || channels.sms)
      ) {
        const assignee =
          assigneeContact || (await resolveAssigneeContact(supabase, issue.assigned_to_user_id))
        const recipientEmail =
          recipients[0]?.email ||
          (assignee.email && assignee.email.includes('@') ? assignee.email : null)
        const normalizedPhone = normalizeAssigneePhone(assignee.phone || '')
        const smsPhone = normalizedPhone.isValid ? normalizedPhone.e164 : null
        const actorName = await resolveActorDisplayName(supabase, user.id)

        const { data: orgRow } = await supabase
          .from('organizations')
          .select('name, progress_report_timezone')
          .eq('id', issue.organization_id)
          .maybeSingle()
        const organizationName = orgRow?.name || projectName || 'Your team'

        if (channels.email && recipientEmail) {
          const template = buildMinimalDigestEmail({
            heading: `${projectName}: Issue assigned to you`,
            subheading: issue.title || 'Field issue',
            ctaUrl: actionUrl,
            reviewLinkText: 'Open this issue in SiteWeave',
            summaryLabel: 'Assigned',
            summaryValue: 1,
            recipientName: assignee.name || 'there',
            tasks: [
              {
                title: issue.title || 'Field issue',
                priority: issue.priority ? String(issue.priority) : null,
              },
            ],
            footerText: `${actorName} assigned this field issue to you.`,
            projectName,
            projectAddress: project?.address ? String(project.address).trim() : null,
            tasksSectionTitle: 'Field issue',
            omitLeadBlock: true,
            calendarTimeZone: orgRow?.progress_report_timezone ?? null,
          })
          const sendResult = await sendTransactionalEmail({
            to: recipientEmail,
            subject: `Assigned: ${issue.title || 'Field issue'}`,
            html: template.html,
            text: template.text,
          })
          emailDelivered = Boolean(sendResult.success)
          if (!sendResult.success) {
            console.error('field_issue_assigned email failed', sendResult.error)
          }
        }

        if (channels.sms && smsPhone && isSmsNotificationsEnabled()) {
          const gate = await gateOrSendOptInForSubstantiveSms(supabase, {
            phoneE164: smsPhone,
            organizationId: issue.organization_id,
            organizationName,
          })
          if (!gate.allowed) {
            smsOptInSent = Boolean(gate.optInSent)
            console.log('field_issue_assigned SMS gated', {
              reason: gate.reason,
              optInSent: gate.optInSent,
            })
          } else {
            const smsBody = withTransactionalSmsFooter(
              `${actorName} assigned you a field issue: ${issue.title || 'Issue'} in ${projectName}. Open: ${actionUrl}`,
            )
            const smsResult = await sendSms({ to: smsPhone, body: smsBody })
            smsDelivered = Boolean(smsResult.success)
            if (!smsResult.success) {
              console.error('field_issue_assigned SMS failed', smsResult.error)
            }
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          notified: channels.app ? recipients.length : 0,
          channels: {
            email: emailDelivered,
            sms: smsDelivered,
            app: channels.app && recipients.length > 0,
            sms_opt_in_sent: smsOptInSent,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    if (action === 'issue_comment') {
      const commentId = body?.commentId as number
      if (!commentId) {
        return new Response(JSON.stringify({ error: 'commentId required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const { data: comment, error: commentError } = await supabase
        .from('issue_comments')
        .select('id, issue_id, organization_id, user_id, comment')
        .eq('id', commentId)
        .single()

      if (commentError || !comment) {
        return new Response(JSON.stringify({ error: 'Comment not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      if (comment.user_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const { data: issue } = await supabase
        .from('project_issues')
        .select('project_id, title, assigned_to_user_id')
        .eq('id', comment.issue_id)
        .single()

      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', issue?.project_id)
        .single()

      const projectName = project?.name || 'Project'
      const preview = (comment.comment || '').slice(0, 120)
      const actionUrl = buildAppProjectUrl(issue!.project_id, 'updates')

      const recipients = await getProjectRecipients(supabase, issue!.project_id, {
        excludeUserId: user.id,
      })

      const notifRows = recipients.map((r) => ({
        organization_id: comment.organization_id,
        project_id: issue!.project_id,
        recipient_user_id: r.userId,
        recipient_email: r.email,
        source_type: 'issue_comment',
        source_id: String(comment.id),
        title: `Issue comment · ${projectName}`,
        body: `${issue!.title}: ${preview}`,
        metadata: {
          action_url: actionUrl,
          issue_id: comment.issue_id,
          comment_id: comment.id,
          screen: `/projects/${issue!.project_id}/updates`,
          project_id: issue!.project_id,
        },
      }))

      await insertUserNotifications(supabase, notifRows)

      const pushTokens = await loadPushTokens(supabase, recipients.map((r) => r.userId))
      await sendExpoPush(pushTokens, {
        title: `Issue comment · ${projectName}`,
        body: preview,
        data: {
          project_id: issue!.project_id,
          issue_id: comment.issue_id,
          screen: `/projects/${issue!.project_id}/updates`,
          source_type: 'issue_comment',
        },
      })

      return new Response(
        JSON.stringify({ success: true, notified: recipients.length }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    if (action === 'punch_list_signed_off') {
      const projectId = body?.projectId as string
      if (!projectId) {
        return new Response(JSON.stringify({ error: 'projectId required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, name, organization_id, punch_list_signed_off_by_name')
        .eq('id', projectId)
        .single()

      if (projectError || !project) {
        return new Response(JSON.stringify({ error: 'Project not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      const projectName = project.name || 'Project'
      const signerName = project.punch_list_signed_off_by_name || 'Client'
      const actionUrl = buildAppProjectUrl(project.id, 'updates')
      const recipients = await getProjectRecipients(supabase, project.id, {})
      const filtered = recipients.filter((r) => r.userId !== user.id)
      const title = `Punch list signed off · ${projectName}`
      const bodyText = `${signerName} signed off the punch list.`

      const notifRows = filtered.map((r) => ({
        organization_id: project.organization_id,
        project_id: project.id,
        recipient_user_id: r.userId,
        recipient_email: r.email,
        source_type: 'punch_list_signed_off',
        source_id: project.id,
        title,
        body: bodyText,
        metadata: {
          action_url: actionUrl,
          screen: `/projects/${project.id}/updates`,
          project_id: project.id,
        },
      }))

      await insertUserNotifications(supabase, notifRows)
      const pushTokens = await loadPushTokens(supabase, filtered.map((r) => r.userId))
      await sendExpoPush(pushTokens, {
        title,
        body: bodyText,
        data: {
          project_id: project.id,
          screen: `/projects/${project.id}/updates`,
          source_type: 'punch_list_signed_off',
        },
      })

      return new Response(
        JSON.stringify({ success: true, notified: filtered.length }),
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
