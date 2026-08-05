import { useCallback, useEffect, useMemo, useState } from 'react'
import { createOpsClient, isConfigured, sentryIssueUrl } from './supabase.js'

const HOURS_24 = 24 * 60 * 60 * 1000
const DAYS_7 = HOURS_24 * 7

const JOB_KIND_LABELS = {
  task_notification: 'Task start email',
  dependency_notification: 'Dependency unlock email',
  scheduled_ping: 'Scheduled ping',
  progress_report: 'Progress report',
  manual_ping: 'Manual ping',
  trial_reminder: 'Trial reminder',
  report_schedule: 'Report schedule',
}

function sinceIso(msAgo = HOURS_24) {
  return new Date(Date.now() - msAgo).toISOString()
}

function humanize(value) {
  if (!value) return '—'
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatWhen(iso) {
  if (!iso) return { relative: '—', absolute: '' }
  try {
    const date = new Date(iso)
    const absolute = date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    const diffMs = Date.now() - date.getTime()
    const mins = Math.round(diffMs / 60000)
    let relative
    if (Number.isNaN(mins)) relative = '—'
    else if (mins < 1) relative = 'Just now'
    else if (mins < 60) relative = `${mins}m ago`
    else if (mins < 60 * 24) relative = `${Math.round(mins / 60)}h ago`
    else relative = `${Math.round(mins / (60 * 24))}d ago`
    return { relative, absolute }
  } catch {
    return { relative: String(iso), absolute: '' }
  }
}

function truncate(text, max = 120) {
  if (text == null || text === '') return '—'
  const s = String(text)
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function StatusPill({ status }) {
  const raw = String(status || 'unknown').toLowerCase()
  const tone =
    ['sent', 'success', 'completed', 'created', 'updated', 'restored', 'signed in', 'active', 'confirmed', 'accepted'].includes(raw)
      ? 'ok'
      : ['failed', 'error', 'deleted', 'purged', 'stuck', 'overdue', 'expired'].includes(raw)
        ? 'bad'
        : ['skipped', 'cancelled', 'trashed', 'idle', 'never', 'pending', 'opted out', 'opted_out', 'manual'].includes(raw)
          ? 'warn'
          : 'neutral'
  return <span className={`pill pill-${tone}`}>{humanize(raw)}</span>
}

function WhenCell({ iso }) {
  const { relative, absolute } = formatWhen(iso)
  return (
    <div className="when" title={absolute}>
      <div className="when-rel">{relative}</div>
      <div className="when-abs">{absolute}</div>
    </div>
  )
}

function MetaLine({ children, title }) {
  return <div className="meta" title={title}>{children}</div>
}

async function listAuthUsers(supabase, maxPages = 5) {
  const users = []
  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const batch = data?.users || []
    users.push(...batch)
    if (batch.length < 200) break
  }
  return users
}

function buildActiveUsers({ authUsers, activityRows, profileByUserId, orgNames }) {
  const cutoff24 = Date.now() - HOURS_24
  const cutoff7 = Date.now() - DAYS_7

  const activityByUser = new Map()
  for (const row of activityRows) {
    if (!row.user_id) continue
    const prev = activityByUser.get(row.user_id) || {
      actions7d: 0,
      actions24h: 0,
      lastActivityAt: null,
      lastAction: null,
      organization_id: null,
      user_name: null,
    }
    prev.actions7d += 1
    const ts = new Date(row.created_at).getTime()
    if (ts >= cutoff24) prev.actions24h += 1
    if (!prev.lastActivityAt || ts > new Date(prev.lastActivityAt).getTime()) {
      prev.lastActivityAt = row.created_at
      prev.lastAction = row.action
      prev.organization_id = row.organization_id || prev.organization_id
      prev.user_name = row.user_name || prev.user_name
    }
    activityByUser.set(row.user_id, prev)
  }

  const rows = authUsers.map((user) => {
    const profile = profileByUserId[user.id] || {}
    const act = activityByUser.get(user.id) || {}
    const lastSignIn = user.last_sign_in_at || null
    const lastActivityAt = act.lastActivityAt || null
    const lastSignInMs = lastSignIn ? new Date(lastSignIn).getTime() : 0
    const lastActivityMs = lastActivityAt ? new Date(lastActivityAt).getTime() : 0
    const signedIn24h = lastSignInMs >= cutoff24
    const active24h = lastActivityMs >= cutoff24 || (act.actions24h || 0) > 0
    const signedIn7d = lastSignInMs >= cutoff7
    const orgId = profile.organization_id || act.organization_id || null

    let status = 'Idle'
    if (active24h) status = 'Active'
    else if (signedIn24h) status = 'Signed in'
    else if (!lastSignIn) status = 'Never'

    return {
      id: user.id,
      email: user.email || '—',
      name: profile.name || act.user_name || user.user_metadata?.full_name || user.email || 'User',
      organization_id: orgId,
      organization_name: orgId ? orgNames[orgId] || null : null,
      last_sign_in_at: lastSignIn,
      last_activity_at: lastActivityAt,
      last_action: act.lastAction || null,
      actions_24h: act.actions24h || 0,
      actions_7d: act.actions7d || 0,
      created_at: user.created_at || null,
      signed_in_24h: signedIn24h,
      active_24h: active24h,
      signed_in_7d: signedIn7d,
      status,
      sortKey: Math.max(lastSignInMs, lastActivityMs, 0),
    }
  })

  rows.sort((a, b) => b.sortKey - a.sortKey)
  return rows
}

export default function App() {
  const [tab, setTab] = useState('activity')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [failures, setFailures] = useState([])
  const [jobs, setJobs] = useState([])
  const [activity, setActivity] = useState([])
  const [users, setUsers] = useState([])
  const [invites, setInvites] = useState([])
  const [smsConsent, setSmsConsent] = useState([])
  const [reportSchedules, setReportSchedules] = useState([])
  const [stats, setStats] = useState({
    tasksCompleted24h: 0,
    tasksCompleted7d: 0,
    signedIn24h: 0,
    signedIn7d: 0,
    activeUsers24h: 0,
    activeOrgs24h: 0,
    newUsers7d: 0,
    pendingInvites: 0,
    stuckSchedules: 0,
    smsPending: 0,
  })
  const [orgNames, setOrgNames] = useState({})
  const [projectNames, setProjectNames] = useState({})
  const [featureFilter, setFeatureFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [jobStatusFilter, setJobStatusFilter] = useState('')
  const [activityActionFilter, setActivityActionFilter] = useState('')
  const [userFilter, setUserFilter] = useState('active')
  const [search, setSearch] = useState('')

  const configured = isConfigured()

  const orgLabel = useCallback(
    (id) => (id && orgNames[id] ? orgNames[id] : null),
    [orgNames],
  )
  const projectLabel = useCallback(
    (id) => (id && projectNames[id] ? projectNames[id] : null),
    [projectNames],
  )

  const load = useCallback(async () => {
    if (!configured) return
    setLoading(true)
    setError(null)
    try {
      const supabase = createOpsClient()
      const since7 = sinceIso(DAYS_7)
      const since24 = sinceIso(HOURS_24)

      const [
        failuresRes,
        activityRes,
        completedTasksRes,
        completed24Res,
        taskNotifRes,
        depNotifRes,
        pingsRes,
        progressReportsRes,
        manualPingRes,
        reportSchedulesRes,
        trialOrgsRes,
        orgInvitesRes,
        projectInvitesRes,
        smsConsentRes,
        authUsers,
      ] = await Promise.all([
        supabase
          .from('operation_failures')
          .select('*')
          .gte('created_at', since7)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('activity_log')
          .select(
            'id, created_at, action, entity_type, entity_id, entity_name, user_id, user_name, organization_id, project_id, details',
          )
          .gte('created_at', since7)
          .order('created_at', { ascending: false })
          .limit(400),
        supabase
          .from('tasks')
          .select('id, text, project_id, organization_id, completed_at')
          .eq('completed', true)
          .not('completed_at', 'is', null)
          .gte('completed_at', since7)
          .order('completed_at', { ascending: false })
          .limit(200),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('completed', true)
          .gte('completed_at', since24),
        supabase
          .from('task_notification_history')
          .select('id, created_at, status, error_message, task_id, organization_id, recipient_email, project_id')
          .gte('created_at', since7)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('task_dependency_notification_history')
          .select('id, created_at, status, error_message, successor_task_id, organization_id, recipient_email, project_id')
          .gte('created_at', since7)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('scheduled_project_pings')
          .select('id, created_at, status, error, project_id, organization_id, entity_type, entity_id')
          .gte('created_at', since7)
          .in('status', ['sent', 'failed', 'cancelled', 'pending', 'processing'])
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('progress_report_history')
          .select(
            'id, sent_at, report_type, report_audience_type, project_id, organization_id, recipient_emails, was_manual_send, email_id, schedule_id',
          )
          .gte('sent_at', since7)
          .order('sent_at', { ascending: false })
          .limit(200),
        supabase
          .from('notification_action_history')
          .select(
            'id, created_at, action_type, payload, notification_id, user_notifications(organization_id, project_id, recipient_email, title, source_type)',
          )
          .in('action_type', ['manual_send', 'manual_send_failed'])
          .gte('created_at', since7)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('progress_report_schedules')
          .select(
            'id, name, organization_id, project_id, is_active, next_send_at, last_sent_at, report_audience_type, frequency, approval_status',
          )
          .eq('is_active', true)
          .order('next_send_at', { ascending: true, nullsFirst: true })
          .limit(200),
        supabase
          .from('organizations')
          .select('id, name, trial_reminder_mid_sent_at, trial_reminder_final_sent_at')
          .or(`trial_reminder_mid_sent_at.gte.${since7},trial_reminder_final_sent_at.gte.${since7}`),
        supabase
          .from('invitations')
          .select('id, email, status, organization_id, project_id, created_at, expires_at, role_to_assign')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('project_access_invites')
          .select('id, invited_email, status, organization_id, project_id, access_level, created_at, expires_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('sms_phone_consent')
          .select('phone_e164, status, pending_organization_id, confirmed_at, opted_out_at, pending_sent_at, updated_at, created_at')
          .order('updated_at', { ascending: false })
          .limit(100),
        listAuthUsers(supabase).catch((err) => {
          console.warn('auth.admin.listUsers failed:', err)
          return []
        }),
      ])

      if (failuresRes.error) throw failuresRes.error
      if (activityRes.error) throw activityRes.error

      const failureRows = failuresRes.data || []
      const activityRows = [...(activityRes.data || [])]

      if (!completedTasksRes.error) {
        const loggedCompletionKeys = new Set(
          activityRows
            .filter((r) => r.action === 'completed' && r.entity_type === 'task' && r.entity_id)
            .map((r) => String(r.entity_id)),
        )
        for (const task of completedTasksRes.data || []) {
          if (loggedCompletionKeys.has(String(task.id))) continue
          activityRows.push({
            id: `task-completed-${task.id}`,
            created_at: task.completed_at,
            action: 'completed',
            entity_type: 'task',
            entity_id: task.id,
            entity_name: task.text,
            user_id: null,
            user_name: 'System',
            organization_id: task.organization_id,
            project_id: task.project_id,
            details: { source: 'tasks.completed_at' },
          })
        }
      }

      activityRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setFailures(failureRows)
      setActivity(activityRows)

      const jobRows = []
      if (!taskNotifRes.error) {
        for (const row of taskNotifRes.data || []) {
          jobRows.push({
            id: `task-notif-${row.id}`,
            kind: 'task_notification',
            status: row.status,
            created_at: row.created_at,
            message: row.error_message || (row.status === 'sent' ? 'Email delivered' : null),
            organization_id: row.organization_id,
            project_id: row.project_id,
            entity_id: row.task_id,
            channel: 'Email',
            recipient: row.recipient_email,
          })
        }
      }
      if (!depNotifRes.error) {
        for (const row of depNotifRes.data || []) {
          jobRows.push({
            id: `dep-notif-${row.id}`,
            kind: 'dependency_notification',
            status: row.status,
            created_at: row.created_at,
            message: row.error_message || (row.status === 'sent' ? 'Email delivered' : null),
            organization_id: row.organization_id,
            project_id: row.project_id,
            entity_id: row.successor_task_id,
            channel: 'Email',
            recipient: row.recipient_email,
          })
        }
      }
      if (!pingsRes.error) {
        for (const row of pingsRes.data || []) {
          jobRows.push({
            id: `ping-${row.id}`,
            kind: 'scheduled_ping',
            status: row.status,
            created_at: row.created_at,
            message: row.error || (row.status === 'sent' ? 'Ping delivered' : null),
            organization_id: row.organization_id,
            project_id: row.project_id,
            entity_id: row.entity_id,
            entity_type: row.entity_type,
            channel: 'Ping',
            recipient: null,
          })
        }
      }
      if (!progressReportsRes.error) {
        for (const row of progressReportsRes.data || []) {
          const recipients = Array.isArray(row.recipient_emails)
            ? row.recipient_emails.filter(Boolean)
            : []
          const audience = humanize(row.report_audience_type)
          const scope = humanize(row.report_type)
          const sendMode = row.was_manual_send ? 'Manual send' : 'Scheduled send'
          jobRows.push({
            id: `progress-report-${row.id}`,
            kind: 'progress_report',
            status: 'sent',
            created_at: row.sent_at,
            message: `${sendMode} · ${scope} · ${audience}${row.email_id ? ` · ${row.email_id}` : ''}`,
            organization_id: row.organization_id,
            project_id: row.project_id,
            entity_id: row.schedule_id,
            entity_type: 'progress_report',
            channel: 'Email',
            recipient:
              recipients.length === 0
                ? null
                : recipients.length <= 2
                  ? recipients.join(', ')
                  : `${recipients.slice(0, 2).join(', ')} +${recipients.length - 2} more`,
          })
        }
      }
      if (!manualPingRes.error) {
        for (const row of manualPingRes.data || []) {
          const notifRaw = row.user_notifications
          const notif = Array.isArray(notifRaw) ? notifRaw[0] || {} : notifRaw || {}
          const channels = row.payload?.channels || {}
          const channelBits = ['email', 'sms', 'app']
            .filter((k) => channels[k])
            .map((k) => k.toUpperCase())
          const failed = row.action_type === 'manual_send_failed'
          jobRows.push({
            id: `manual-ping-${row.id}`,
            kind: 'manual_ping',
            status: failed ? 'failed' : 'sent',
            created_at: row.created_at,
            message:
              row.payload?.error ||
              notif.title ||
              (channelBits.length ? `Via ${channelBits.join(' · ')}` : null),
            organization_id: notif.organization_id || null,
            project_id: notif.project_id || null,
            entity_id: row.payload?.task_id || row.payload?.issue_id || row.notification_id,
            entity_type: notif.source_type || 'ping',
            channel: channelBits.length ? channelBits.join(' · ') : 'Ping',
            recipient: notif.recipient_email || null,
          })
        }
      }
      if (!trialOrgsRes.error) {
        for (const org of trialOrgsRes.data || []) {
          if (org.trial_reminder_mid_sent_at && new Date(org.trial_reminder_mid_sent_at) >= new Date(since7)) {
            jobRows.push({
              id: `trial-mid-${org.id}-${org.trial_reminder_mid_sent_at}`,
              kind: 'trial_reminder',
              status: 'sent',
              created_at: org.trial_reminder_mid_sent_at,
              message: 'Mid-trial reminder stamped',
              organization_id: org.id,
              project_id: null,
              entity_id: org.id,
              entity_type: 'organization',
              channel: 'Email',
              recipient: org.name || null,
            })
          }
          if (org.trial_reminder_final_sent_at && new Date(org.trial_reminder_final_sent_at) >= new Date(since7)) {
            jobRows.push({
              id: `trial-final-${org.id}-${org.trial_reminder_final_sent_at}`,
              kind: 'trial_reminder',
              status: 'sent',
              created_at: org.trial_reminder_final_sent_at,
              message: 'Final trial reminder stamped',
              organization_id: org.id,
              project_id: null,
              entity_id: org.id,
              entity_type: 'organization',
              channel: 'Email',
              recipient: org.name || null,
            })
          }
        }
      }

      const nowMs = Date.now()
      const scheduleRows = []
      if (!reportSchedulesRes.error) {
        for (const row of reportSchedulesRes.data || []) {
          const isManual = row.frequency === 'manual'
          const nextMs = row.next_send_at ? new Date(row.next_send_at).getTime() : null
          let status = 'active'
          let message = nextMs
            ? `Next ${formatWhen(row.next_send_at).absolute}`
            : isManual
              ? 'Manual only — not on cron'
              : 'Recurring schedule missing next_send_at — cron will not pick this up'

          if (isManual) {
            status = 'manual'
          } else if (!row.next_send_at) {
            status = 'stuck'
          } else if (nextMs < nowMs - HOURS_24) {
            status = 'overdue'
            message = `Overdue · was due ${formatWhen(row.next_send_at).absolute}`
          } else if (nextMs < nowMs) {
            status = 'overdue'
            message = `Due now · ${formatWhen(row.next_send_at).absolute}`
          }

          scheduleRows.push({
            ...row,
            status,
            message,
          })
          if (status === 'stuck' || status === 'overdue') {
            jobRows.push({
              id: `report-schedule-${row.id}`,
              kind: 'report_schedule',
              status,
              created_at: row.next_send_at || row.last_sent_at || since7,
              message,
              organization_id: row.organization_id,
              project_id: row.project_id,
              entity_id: row.id,
              entity_type: 'progress_report_schedule',
              channel: humanize(row.frequency) || 'Schedule',
              recipient: row.name || humanize(row.report_audience_type),
            })
          }
        }
      }
      setReportSchedules(scheduleRows)

      const inviteRows = []
      if (!orgInvitesRes.error) {
        for (const row of orgInvitesRes.data || []) {
          inviteRows.push({
            id: `org-invite-${row.id}`,
            kind: 'org_invite',
            email: row.email,
            status: row.status,
            organization_id: row.organization_id,
            project_id: row.project_id,
            created_at: row.created_at,
            expires_at: row.expires_at,
            detail: row.role_to_assign ? `Role ${humanize(row.role_to_assign)}` : 'Org invite',
          })
        }
      }
      if (!projectInvitesRes.error) {
        for (const row of projectInvitesRes.data || []) {
          inviteRows.push({
            id: `project-invite-${row.id}`,
            kind: 'project_invite',
            email: row.invited_email,
            status: row.status,
            organization_id: row.organization_id,
            project_id: row.project_id,
            created_at: row.created_at,
            expires_at: row.expires_at,
            detail: `Project access · ${humanize(row.access_level)}`,
          })
        }
      }
      inviteRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setInvites(inviteRows)
      setSmsConsent(smsConsentRes.error ? [] : smsConsentRes.data || [])

      jobRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setJobs(jobRows)

      const userIds = authUsers.map((u) => u.id).filter(Boolean)
      const profileByUserId = {}
      if (userIds.length) {
        // chunk .in() for large user lists
        for (let i = 0; i < userIds.length; i += 100) {
          const chunk = userIds.slice(i, i + 100)
          const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, organization_id, contacts(name)')
            .in('id', chunk)
          if (profileError) {
            console.warn('profiles lookup failed:', profileError.message)
            break
          }
          for (const p of profiles || []) {
            profileByUserId[p.id] = {
              organization_id: p.organization_id,
              name: p.contacts?.name || null,
            }
          }
        }
      }

      const orgIds = [
        ...new Set(
          [
            ...failureRows.map((r) => r.organization_id),
            ...activityRows.map((r) => r.organization_id),
            ...jobRows.map((r) => r.organization_id),
            ...inviteRows.map((r) => r.organization_id),
            ...scheduleRows.map((r) => r.organization_id),
            ...(smsConsentRes.data || []).map((r) => r.pending_organization_id),
            ...Object.values(profileByUserId).map((p) => p.organization_id),
          ].filter(Boolean),
        ),
      ]
      const projectIds = [
        ...new Set(
          [
            ...failureRows.map((r) => r.project_id),
            ...activityRows.map((r) => r.project_id),
            ...jobRows.map((r) => r.project_id),
            ...inviteRows.map((r) => r.project_id),
            ...scheduleRows.map((r) => r.project_id),
          ].filter(Boolean),
        ),
      ]

      const [orgsRes, projectsRes] = await Promise.all([
        orgIds.length
          ? supabase.from('organizations').select('id, name').in('id', orgIds)
          : Promise.resolve({ data: [], error: null }),
        projectIds.length
          ? supabase.from('projects').select('id, name').in('id', projectIds)
          : Promise.resolve({ data: [], error: null }),
      ])

      const nextOrgs = {}
      for (const o of orgsRes.data || []) nextOrgs[o.id] = o.name
      const nextProjects = {}
      for (const p of projectsRes.data || []) nextProjects[p.id] = p.name
      setOrgNames(nextOrgs)
      setProjectNames(nextProjects)

      const userRows = buildActiveUsers({
        authUsers,
        activityRows,
        profileByUserId,
        orgNames: nextOrgs,
      })
      setUsers(userRows)

      const cutoff24 = Date.now() - HOURS_24
      const cutoff7 = Date.now() - DAYS_7
      const activeOrgs24h = new Set(
        activityRows
          .filter((r) => new Date(r.created_at).getTime() >= cutoff24 && r.organization_id)
          .map((r) => r.organization_id),
      ).size

      setStats({
        tasksCompleted24h: completed24Res.count || 0,
        tasksCompleted7d: (completedTasksRes.data || []).length,
        signedIn24h: userRows.filter((u) => u.signed_in_24h).length,
        signedIn7d: userRows.filter((u) => u.signed_in_7d).length,
        activeUsers24h: userRows.filter((u) => u.active_24h).length,
        activeOrgs24h,
        newUsers7d: authUsers.filter((u) => u.created_at && new Date(u.created_at).getTime() >= cutoff7).length,
        pendingInvites: inviteRows.length,
        stuckSchedules: scheduleRows.filter((s) => s.status === 'stuck' || s.status === 'overdue').length,
        smsPending: (smsConsentRes.data || []).filter((s) => s.status === 'pending').length,
      })

      const loadWarnings = [
        completedTasksRes.error?.message,
        completed24Res.error?.message,
        taskNotifRes.error?.message,
        depNotifRes.error?.message,
        pingsRes.error?.message,
        progressReportsRes.error?.message,
        manualPingRes.error?.message,
        reportSchedulesRes.error?.message,
        trialOrgsRes.error?.message,
        orgInvitesRes.error?.message,
        projectInvitesRes.error?.message,
        smsConsentRes.error?.message,
        orgsRes.error?.message,
        projectsRes.error?.message,
      ].filter(Boolean)
      if (loadWarnings.length) {
        setError(`Some lookups failed: ${loadWarnings.join('; ')}`)
      }
    } catch (err) {
      setError(err.message || String(err))
      setFailures([])
      setJobs([])
      setActivity([])
      setUsers([])
      setInvites([])
      setSmsConsent([])
      setReportSchedules([])
    } finally {
      setLoading(false)
    }
  }, [configured])

  useEffect(() => {
    void load()
  }, [load])

  const last24h = useMemo(() => {
    const cutoff = Date.now() - HOURS_24
    const inWindow = (iso) => new Date(iso).getTime() >= cutoff
    return {
      activity: activity.filter((a) => inWindow(a.created_at)).length,
      jobsSent: jobs.filter((j) => inWindow(j.created_at) && j.status === 'sent').length,
      failures: failures.filter((f) => inWindow(f.created_at)).length,
      jobsFailed: jobs.filter((j) => inWindow(j.created_at) && j.status === 'failed').length,
    }
  }, [activity, jobs, failures])

  const filteredFailures = useMemo(() => {
    const q = search.trim().toLowerCase()
    return failures.filter((row) => {
      if (featureFilter && row.feature !== featureFilter) return false
      if (sourceFilter && row.source !== sourceFilter) return false
      if (!q) return true
      const org = orgLabel(row.organization_id) || ''
      const project = projectLabel(row.project_id) || ''
      return (
        row.message?.toLowerCase().includes(q) ||
        row.feature?.toLowerCase().includes(q) ||
        row.operation?.toLowerCase().includes(q) ||
        org.toLowerCase().includes(q) ||
        project.toLowerCase().includes(q)
      )
    })
  }, [failures, featureFilter, sourceFilter, search, orgLabel, projectLabel])

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return jobs.filter((row) => {
      if (jobStatusFilter && row.status !== jobStatusFilter) return false
      if (!q) return true
      const kind = JOB_KIND_LABELS[row.kind] || row.kind
      const org = orgLabel(row.organization_id) || ''
      const project = projectLabel(row.project_id) || ''
      return (
        row.message?.toLowerCase().includes(q) ||
        kind.toLowerCase().includes(q) ||
        row.status?.toLowerCase().includes(q) ||
        row.recipient?.toLowerCase().includes(q) ||
        org.toLowerCase().includes(q) ||
        project.toLowerCase().includes(q)
      )
    })
  }, [jobs, jobStatusFilter, search, orgLabel, projectLabel])

  const filteredInvites = useMemo(() => {
    const q = search.trim().toLowerCase()
    return invites.filter((row) => {
      if (!q) return true
      const org = orgLabel(row.organization_id) || ''
      const project = projectLabel(row.project_id) || ''
      return (
        row.email?.toLowerCase().includes(q) ||
        row.detail?.toLowerCase().includes(q) ||
        row.kind?.toLowerCase().includes(q) ||
        org.toLowerCase().includes(q) ||
        project.toLowerCase().includes(q)
      )
    })
  }, [invites, search, orgLabel, projectLabel])

  const filteredSms = useMemo(() => {
    const q = search.trim().toLowerCase()
    return smsConsent.filter((row) => {
      if (!q) return true
      const org = orgLabel(row.pending_organization_id) || ''
      return (
        row.phone_e164?.toLowerCase().includes(q) ||
        row.status?.toLowerCase().includes(q) ||
        org.toLowerCase().includes(q)
      )
    })
  }, [smsConsent, search, orgLabel])

  const filteredSchedules = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reportSchedules.filter((row) => {
      if (!q) return true
      const org = orgLabel(row.organization_id) || ''
      const project = projectLabel(row.project_id) || ''
      return (
        row.name?.toLowerCase().includes(q) ||
        row.status?.toLowerCase().includes(q) ||
        row.message?.toLowerCase().includes(q) ||
        org.toLowerCase().includes(q) ||
        project.toLowerCase().includes(q)
      )
    })
  }, [reportSchedules, search, orgLabel, projectLabel])

  const filteredActivity = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = activity.filter((row) => {
      if (activityActionFilter && row.action !== activityActionFilter) return false
      if (!q) return true
      const org = orgLabel(row.organization_id) || ''
      const project = projectLabel(row.project_id) || ''
      return (
        row.action?.toLowerCase().includes(q) ||
        row.entity_type?.toLowerCase().includes(q) ||
        row.entity_name?.toLowerCase().includes(q) ||
        row.user_name?.toLowerCase().includes(q) ||
        org.toLowerCase().includes(q) ||
        project.toLowerCase().includes(q)
      )
    })

    // Collapse near-duplicate rows already written (same action/entity within 3s).
    const deduped = []
    const seen = new Map()
    for (const row of rows) {
      const key = `${row.action}:${row.entity_type}:${row.entity_id || row.entity_name}`
      const ts = new Date(row.created_at).getTime()
      const prevTs = seen.get(key)
      if (prevTs != null && Math.abs(prevTs - ts) < 3000) continue
      seen.set(key, ts)
      deduped.push(row)
    }
    return deduped
  }, [activity, activityActionFilter, search, orgLabel, projectLabel])

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((row) => {
      if (userFilter === 'active' && !row.active_24h && !row.signed_in_24h) return false
      if (userFilter === 'signed_in' && !row.signed_in_7d) return false
      if (userFilter === 'new' && !(row.created_at && new Date(row.created_at).getTime() >= Date.now() - DAYS_7)) {
        return false
      }
      if (!q) return true
      return (
        row.name?.toLowerCase().includes(q) ||
        row.email?.toLowerCase().includes(q) ||
        row.organization_name?.toLowerCase().includes(q) ||
        row.status?.toLowerCase().includes(q)
      )
    })
  }, [users, userFilter, search])

  const features = useMemo(
    () => [...new Set(failures.map((f) => f.feature).filter(Boolean))].sort(),
    [failures],
  )
  const sources = useMemo(
    () => [...new Set(failures.map((f) => f.source).filter(Boolean))].sort(),
    [failures],
  )
  const jobStatuses = useMemo(
    () => [...new Set(jobs.map((j) => j.status).filter(Boolean))].sort(),
    [jobs],
  )
  const activityActions = useMemo(
    () => [...new Set(activity.map((a) => a.action).filter(Boolean))].sort(),
    [activity],
  )

  return (
    <div className="app">
      <header>
        <div>
          <h1>SiteWeave Ops</h1>
        </div>
        <span className="badge">Local only · 127.0.0.1</span>
      </header>

      {!configured && (
        <div className="error-box">
          Missing env. Copy <code>apps/ops/.env.example</code> to{' '}
          <code>apps/ops/.env.local</code> and set <code>VITE_SUPABASE_URL</code> +{' '}
          <code>VITE_SUPABASE_SERVICE_ROLE_KEY</code>.
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      <div className="health">
        <div className="stat">
          <div className="label">Signed in · 24h</div>
          <div className="value value-ok">{stats.signedIn24h}</div>
        </div>
        <div className="stat">
          <div className="label">Active in app · 24h</div>
          <div className="value value-ok">{stats.activeUsers24h}</div>
        </div>
        <div className="stat">
          <div className="label">Tasks done · 24h</div>
          <div className="value value-ok">{stats.tasksCompleted24h}</div>
        </div>
        <div className="stat">
          <div className="label">Active orgs · 24h</div>
          <div className="value value-ok">{stats.activeOrgs24h}</div>
        </div>
        <div className="stat">
          <div className="label">User actions · 24h</div>
          <div className="value value-ok">{last24h.activity}</div>
        </div>
        <div className="stat">
          <div className="label">Emails / pings / reports</div>
          <div className="value value-ok">{last24h.jobsSent}</div>
        </div>
        <div className="stat">
          <div className="label">Job failures · 24h</div>
          <div className={`value ${last24h.jobsFailed ? 'value-bad' : ''}`}>{last24h.jobsFailed}</div>
        </div>
        <div className="stat">
          <div className="label">App failures · 24h</div>
          <div className={`value ${last24h.failures ? 'value-bad' : ''}`}>{last24h.failures}</div>
        </div>
        <div className="stat">
          <div className="label">Stuck report schedules</div>
          <div className={`value ${stats.stuckSchedules ? 'value-bad' : ''}`}>{stats.stuckSchedules}</div>
        </div>
        <div className="stat">
          <div className="label">New users · 7d</div>
          <div className="value">{stats.newUsers7d}</div>
        </div>
      </div>

      <div className="tabs">
        <button type="button" className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>
          Activity
          <span className="tab-count">{activity.length}</span>
        </button>
        <button type="button" className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
          Users
          <span className="tab-count">{stats.activeUsers24h || users.filter((u) => u.signed_in_24h).length}</span>
        </button>
        <button type="button" className={tab === 'jobs' ? 'active' : ''} onClick={() => setTab('jobs')}>
          Jobs
          <span className="tab-count">{jobs.length}</span>
        </button>
        <button type="button" className={tab === 'queues' ? 'active' : ''} onClick={() => setTab('queues')}>
          Queues
          <span className="tab-count">{stats.pendingInvites + stats.stuckSchedules + smsConsent.length}</span>
        </button>
        <button type="button" className={tab === 'failures' ? 'active' : ''} onClick={() => setTab('failures')}>
          Failures
          <span className="tab-count">{failures.length}</span>
        </button>
        <button type="button" className="btn" onClick={() => void load()} disabled={loading || !configured}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {tab === 'users' && (
        <>
          <div className="toolbar">
            <input
              type="search"
              placeholder="Search name, email, org…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
              <option value="active">Active / signed in today</option>
              <option value="signed_in">Signed in · 7 days</option>
              <option value="new">New · 7 days</option>
              <option value="all">All users</option>
            </select>
          </div>
          <div className="panel">
            {filteredUsers.length === 0 ? (
              <div className="empty">
                {users.length === 0
                  ? 'Could not load users (check service role key), or none match.'
                  : 'No users match this filter.'}
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Status</th>
                    <th>Last sign-in</th>
                    <th>Last activity</th>
                    <th>Actions · 7d</th>
                    <th>Organization</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="row-primary">{row.name}</div>
                        <MetaLine>{row.email}</MetaLine>
                      </td>
                      <td><StatusPill status={row.status} /></td>
                      <td><WhenCell iso={row.last_sign_in_at} /></td>
                      <td>
                        <WhenCell iso={row.last_activity_at} />
                        {row.last_action ? <MetaLine>{humanize(row.last_action)}</MetaLine> : null}
                      </td>
                      <td>
                        <div className="row-primary">{row.actions_7d}</div>
                        <MetaLine>{row.actions_24h} today</MetaLine>
                      </td>
                      <td>
                        <div className="row-primary">{row.organization_name || '—'}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'activity' && (
        <>
          <div className="toolbar">
            <input
              type="search"
              placeholder="Search people, tasks, projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={activityActionFilter} onChange={(e) => setActivityActionFilter(e.target.value)}>
              <option value="">All actions</option>
              {activityActions.map((a) => (
                <option key={a} value={a}>{humanize(a)}</option>
              ))}
            </select>
          </div>
          <div className="panel">
            {filteredActivity.length === 0 ? (
              <div className="empty">No user activity in the last 7 days.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>What happened</th>
                    <th>Who</th>
                    <th>Where</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivity.map((row) => {
                    const org = orgLabel(row.organization_id)
                    const project = projectLabel(row.project_id)
                    return (
                      <tr key={row.id}>
                        <td><WhenCell iso={row.created_at} /></td>
                        <td>
                          <div className="row-title">
                            <StatusPill status={row.action} />
                            <span className="entity-type">{humanize(row.entity_type)}</span>
                          </div>
                          <div className="row-primary">{truncate(row.entity_name, 80)}</div>
                        </td>
                        <td>
                          <div className="row-primary">{row.user_name || 'Unknown user'}</div>
                        </td>
                        <td>
                          <div className="row-primary">{project || '—'}</div>
                          <MetaLine>{org || 'Unknown org'}</MetaLine>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'jobs' && (
        <>
          <div className="toolbar">
            <input
              type="search"
              placeholder="Search emails, reports, projects, status…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={jobStatusFilter} onChange={(e) => setJobStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {jobStatuses.map((s) => (
                <option key={s} value={s}>{humanize(s)}</option>
              ))}
            </select>
          </div>
          <div className="panel">
            {filteredJobs.length === 0 ? (
              <div className="empty">No delivery jobs, manual pings, or stuck schedules in the last 7 days.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Status</th>
                    <th>Job</th>
                    <th>To / detail</th>
                    <th>Where</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((row) => {
                    const org = orgLabel(row.organization_id)
                    const project = projectLabel(row.project_id)
                    return (
                      <tr key={row.id}>
                        <td><WhenCell iso={row.created_at} /></td>
                        <td><StatusPill status={row.status} /></td>
                        <td>
                          <div className="row-primary">{JOB_KIND_LABELS[row.kind] || humanize(row.kind)}</div>
                          <MetaLine>{row.channel || '—'}</MetaLine>
                        </td>
                        <td>
                          <div className="row-primary">{row.recipient || (row.entity_type ? humanize(row.entity_type) : '—')}</div>
                          <MetaLine title={row.message}>{truncate(row.message, 100)}</MetaLine>
                        </td>
                        <td>
                          <div className="row-primary">{project || '—'}</div>
                          <MetaLine>{org || '—'}</MetaLine>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'queues' && (
        <>
          <div className="toolbar">
            <input
              type="search"
              placeholder="Search invites, phones, schedules…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <h2 className="section-title">Pending invites</h2>
          <div className="panel compact">
            {filteredInvites.length === 0 ? (
              <div className="empty">No pending org or project invites.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Status</th>
                    <th>Invite</th>
                    <th>Email</th>
                    <th>Where</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvites.map((row) => (
                    <tr key={row.id}>
                      <td><WhenCell iso={row.created_at} /></td>
                      <td><StatusPill status={row.status} /></td>
                      <td>
                        <div className="row-primary">{humanize(row.kind)}</div>
                        <MetaLine>{row.detail}</MetaLine>
                      </td>
                      <td>
                        <div className="row-primary">{row.email || '—'}</div>
                        {row.expires_at ? <MetaLine>Expires {formatWhen(row.expires_at).absolute}</MetaLine> : null}
                      </td>
                      <td>
                        <div className="row-primary">{projectLabel(row.project_id) || '—'}</div>
                        <MetaLine>{orgLabel(row.organization_id) || '—'}</MetaLine>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <h2 className="section-title">Progress report schedules</h2>
          <div className="panel compact">
            {filteredSchedules.length === 0 ? (
              <div className="empty">No active progress report schedules.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Next send</th>
                    <th>Status</th>
                    <th>Schedule</th>
                    <th>Last sent</th>
                    <th>Where</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSchedules.map((row) => (
                    <tr key={row.id}>
                      <td><WhenCell iso={row.next_send_at} /></td>
                      <td><StatusPill status={row.status} /></td>
                      <td>
                        <div className="row-primary">{row.name || humanize(row.report_audience_type)}</div>
                        <MetaLine>
                          {humanize(row.frequency)}
                          {row.message ? ` · ${truncate(row.message, 80)}` : ''}
                        </MetaLine>
                      </td>
                      <td><WhenCell iso={row.last_sent_at} /></td>
                      <td>
                        <div className="row-primary">{projectLabel(row.project_id) || 'Org-wide'}</div>
                        <MetaLine>{orgLabel(row.organization_id) || '—'}</MetaLine>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <h2 className="section-title">SMS consent</h2>
          <div className="panel compact">
            {filteredSms.length === 0 ? (
              <div className="empty">No SMS consent rows.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Updated</th>
                    <th>Status</th>
                    <th>Phone</th>
                    <th>Org</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSms.map((row) => (
                    <tr key={`${row.phone_e164}-${row.status}-${row.updated_at}`}>
                      <td><WhenCell iso={row.updated_at || row.created_at} /></td>
                      <td><StatusPill status={row.status} /></td>
                      <td>
                        <div className="row-primary">{row.phone_e164 || '—'}</div>
                        {row.confirmed_at ? <MetaLine>Confirmed {formatWhen(row.confirmed_at).relative}</MetaLine> : null}
                        {row.opted_out_at ? <MetaLine>Opted out {formatWhen(row.opted_out_at).relative}</MetaLine> : null}
                      </td>
                      <td>
                        <div className="row-primary">{orgLabel(row.pending_organization_id) || '—'}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'failures' && (
        <>
          <div className="toolbar">
            <input
              type="search"
              placeholder="Search errors, features, orgs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={featureFilter} onChange={(e) => setFeatureFilter(e.target.value)}>
              <option value="">All features</option>
              {features.map((f) => (
                <option key={f} value={f}>{humanize(f)}</option>
              ))}
            </select>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="">All sources</option>
              {sources.map((s) => (
                <option key={s} value={s}>{humanize(s)}</option>
              ))}
            </select>
          </div>
          <div className="panel">
            {filteredFailures.length === 0 ? (
              <div className="empty">
                No app failures in the last 7 days. Many edge/email errors still go to Sentry only —
                check Sentry if something looks wrong.
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Where it broke</th>
                    <th>Error</th>
                    <th>Context</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFailures.map((row) => {
                    const sentryUrl = sentryIssueUrl(row.sentry_event_id)
                    const org = orgLabel(row.organization_id)
                    const project = projectLabel(row.project_id)
                    return (
                      <tr key={row.id}>
                        <td><WhenCell iso={row.created_at} /></td>
                        <td>
                          <div className="row-primary">
                            {humanize(row.feature)} · {humanize(row.operation)}
                          </div>
                          <MetaLine>{humanize(row.source)}</MetaLine>
                        </td>
                        <td>
                          <div className="row-error" title={row.message}>{truncate(row.message, 140)}</div>
                          {row.error_code ? <MetaLine>Code {row.error_code}</MetaLine> : null}
                        </td>
                        <td>
                          <div className="row-primary">{project || '—'}</div>
                          <MetaLine>{org || '—'}</MetaLine>
                        </td>
                        <td className="cell-action">
                          {sentryUrl ? (
                            <a href={sentryUrl} target="_blank" rel="noreferrer">
                              Sentry
                            </a>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
