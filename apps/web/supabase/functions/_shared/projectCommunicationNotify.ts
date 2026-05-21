import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') || ''

export type ProjectRecipient = {
  userId: string
  email: string
}

export function buildAppProjectUrl(projectId: string, tab?: 'stream' | 'tasks') {
  const base = Deno.env.get('PUBLIC_APP_URL') || Deno.env.get('DESKTOP_APP_URL') || 'https://app.siteweave.org'
  const path = tab === 'stream' ? `/projects/${projectId}/stream` : `/projects/${projectId}/tasks`
  return `${base.replace(/\/$/, '')}${path}`
}

export function parseMentionTokens(body: string): Array<{ type: 'email' | 'handle'; value: string }> {
  if (!body) return []
  const tokens: Array<{ type: 'email' | 'handle'; value: string }> = []
  const seen = new Set<string>()

  const emailRe = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
  let m: RegExpExecArray | null
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

/**
 * Users who should receive project communication alerts (excludes author).
 */
export async function getProjectRecipients(
  supabase: SupabaseClient,
  projectId: string,
  options: { excludeUserId?: string; orgMembersOnly?: boolean } = {},
): Promise<ProjectRecipient[]> {
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, organization_id, project_manager_id, created_by_user_id')
    .eq('id', projectId)
    .single()

  if (projectError || !project) return []

  const userIdSet = new Set<string>()

  const { data: collaborators } = await supabase
    .from('project_collaborators')
    .select('user_id')
    .eq('project_id', projectId)

  collaborators?.forEach((c) => {
    if (c.user_id) userIdSet.add(c.user_id)
  })

  if (project.project_manager_id) userIdSet.add(project.project_manager_id)
  if (project.created_by_user_id) userIdSet.add(project.created_by_user_id)

  const { data: projectContacts } = await supabase
    .from('project_contacts')
    .select('contact_id')
    .eq('project_id', projectId)

  const contactIds = (projectContacts || []).map((pc) => pc.contact_id).filter(Boolean)
  if (contactIds.length) {
    let profileQuery = supabase
      .from('profiles')
      .select('id')
      .in('contact_id', contactIds)

    if (options.orgMembersOnly && project.organization_id) {
      profileQuery = profileQuery.eq('organization_id', project.organization_id)
    }

    const { data: linkedProfiles } = await profileQuery
    linkedProfiles?.forEach((p) => userIdSet.add(p.id))
  }

  if (options.excludeUserId) userIdSet.delete(options.excludeUserId)

  if (userIdSet.size === 0) return []

  const recipients: ProjectRecipient[] = []
  for (const userId of userIdSet) {
    const { data: { user: authUser }, error } = await supabase.auth.admin.getUserById(userId)
    if (!error && authUser?.email) {
      recipients.push({ userId, email: authUser.email.toLowerCase() })
    }
  }
  return recipients
}

export async function resolveMentionedRecipients(
  supabase: SupabaseClient,
  projectId: string,
  body: string,
  organizationId: string,
): Promise<ProjectRecipient[]> {
  const tokens = parseMentionTokens(body)
  if (!tokens.length) return []

  const { data: projectContacts } = await supabase
    .from('project_contacts')
    .select('contact_id, contacts(id, name, email)')
    .eq('project_id', projectId)

  const contacts = (projectContacts || [])
    .map((pc) => pc.contacts)
    .filter((c): c is { id: string; name: string; email: string | null } => Boolean(c))

  const matchedContactIds = new Set<string>()

  for (const token of tokens) {
    if (token.type === 'email') {
      const c = contacts.find((x) => x.email?.toLowerCase() === token.value)
      if (c) matchedContactIds.add(c.id)
    } else {
      const needle = token.value.toLowerCase()
      for (const c of contacts) {
        const name = (c.name || '').toLowerCase()
        if (name === needle || name.startsWith(`${needle} `) || name.includes(` ${needle}`)) {
          matchedContactIds.add(c.id)
        }
      }
    }
  }

  if (!matchedContactIds.size) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, contact_id')
    .in('contact_id', [...matchedContactIds])
    .eq('organization_id', organizationId)

  if (!profiles?.length) return []

  const recipients: ProjectRecipient[] = []
  for (const p of profiles) {
    const { data: { user: authUser }, error } = await supabase.auth.admin.getUserById(p.id)
    if (!error && authUser?.email) {
      recipients.push({ userId: p.id, email: authUser.email.toLowerCase() })
    }
  }
  return recipients
}

export async function sendExpoPush(
  tokens: string[],
  payload: { title: string; body: string; data?: Record<string, unknown> },
) {
  if (!tokens.length) return { sent: 0 }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${EXPO_ACCESS_TOKEN}`

  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    priority: 'high',
  }))

  const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) })
  if (!res.ok) {
    console.error('Expo push failed', await res.text())
    return { sent: 0 }
  }
  const json = await res.json()
  const ok = (json.data || []).filter((r: { status?: string }) => r.status === 'ok').length
  return { sent: ok }
}

export async function insertUserNotifications(
  supabase: SupabaseClient,
  rows: Array<{
    organization_id: string
    project_id: string
    recipient_user_id: string
    recipient_email: string
    source_type: string
    source_id: string
    title: string
    body: string
    metadata?: Record<string, unknown>
  }>,
) {
  if (!rows.length) return
  const { error } = await supabase.from('user_notifications').upsert(
    rows.map((r) => ({
      organization_id: r.organization_id,
      project_id: r.project_id,
      recipient_user_id: r.recipient_user_id,
      recipient_email: r.recipient_email,
      source_type: r.source_type,
      source_id: r.source_id,
      title: r.title,
      body: r.body,
      metadata: r.metadata || {},
    })),
    { onConflict: 'source_type,source_id,recipient_email' },
  )
  if (error) console.error('user_notifications upsert', error)
}
