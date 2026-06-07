/**
 * Shared authentication and authorization helpers for edge functions.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type AuthUser = { id: string; email?: string }

export type UserProfile = {
  id: string
  organization_id: string | null
  role_id: string | null
  is_super_admin?: boolean | null
  roles?: { permissions?: Record<string, unknown>; name?: string } | null
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const CRON_SECRET = (Deno.env.get('CRON_SECRET') ?? '').trim()
const PLATFORM_ADMIN_SECRET = (Deno.env.get('PLATFORM_ADMIN_SECRET') ?? '').trim()

export function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  return token || null
}

function getJwtClaims(token: string): { role?: string; ref?: string } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return { role: payload?.role, ref: payload?.ref }
  } catch {
    return null
  }
}

function getProjectRef(): string | null {
  const match = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)
  return match?.[1] ?? null
}

/** Accept exact env match or a service_role JWT for this project. */
export function isServiceRoleToken(token: string): boolean {
  if (!token) return false
  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) return true
  const claims = getJwtClaims(token)
  if (claims?.role !== 'service_role') return false
  const ref = getProjectRef()
  if (ref && claims.ref && claims.ref !== ref) return false
  return true
}

let _serviceClient: SupabaseClient | null = null
let _anonClient: SupabaseClient | null = null

export function createServiceClient(): SupabaseClient {
  if (!_serviceClient) {
    _serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _serviceClient
}

function getAnonClient(): SupabaseClient {
  if (!_anonClient) {
    _anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _anonClient
}

export function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

/** Validates JWT and returns the authenticated user. */
export async function requireUser(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<{ user: AuthUser; token: string } | Response> {
  const token = getBearerToken(req)
  if (!token) {
    return jsonResponse({ error: 'Missing authorization' }, 401, corsHeaders)
  }
  if (isServiceRoleToken(token)) {
    return jsonResponse({ error: 'User session required' }, 401, corsHeaders)
  }
  if (!SUPABASE_ANON_KEY) {
    return jsonResponse({ error: 'Server misconfiguration' }, 500, corsHeaders)
  }
  const jwtClient = getAnonClient()
  const { data: { user }, error } = await jwtClient.auth.getUser(token)
  if (error || !user) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401, corsHeaders)
  }
  return { user: { id: user.id, email: user.email ?? undefined }, token }
}

/** Cron jobs and internal triggers. */
export function requireCronOrServiceRole(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  const token = getBearerToken(req)
  if (!token) {
    return jsonResponse({ error: 'Missing authorization' }, 401, corsHeaders)
  }
  if (isServiceRoleToken(token)) {
    return null
  }
  const cronHeader = req.headers.get('x-cron-secret') ?? ''
  if (CRON_SECRET && (token === CRON_SECRET || cronHeader === CRON_SECRET)) {
    return null
  }
  return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders)
}

export function requirePlatformAdmin(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  if (!PLATFORM_ADMIN_SECRET) {
    return jsonResponse({ error: 'Platform admin not configured' }, 503, corsHeaders)
  }
  const provided =
    req.headers.get('x-platform-admin-secret') ??
    getBearerToken(req) ??
    ''
  if (provided !== PLATFORM_ADMIN_SECRET) {
    return jsonResponse({ error: 'Forbidden' }, 403, corsHeaders)
  }
  return null
}

export async function loadProfile(
  supabase: SupabaseClient,
  userId: string,
  organizationId?: string,
): Promise<UserProfile | null> {
  let query = supabase
    .from('profiles')
    .select(`
      id,
      organization_id,
      role_id,
      is_super_admin,
      roles ( permissions, name )
    `)
    .eq('id', userId)

  if (organizationId) {
    query = query.eq('organization_id', organizationId)
  }

  const { data } = await query.maybeSingle()
  return data as UserProfile | null
}

export function roleHasPermission(
  profile: UserProfile | null,
  permission: string,
): boolean {
  if (!profile) return false
  if (profile.is_super_admin) return true
  const perms = profile.roles?.permissions as Record<string, unknown> | undefined
  return perms?.[permission] === true
}

export async function assertOrgMember(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
  corsHeaders: Record<string, string>,
): Promise<{ profile: UserProfile } | Response> {
  const profile = await loadProfile(supabase, userId, organizationId)
  if (!profile?.organization_id || profile.organization_id !== organizationId) {
    return jsonResponse({ error: 'Not allowed for this organization' }, 403, corsHeaders)
  }
  return { profile }
}

export async function assertCanManageProject(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  corsHeaders: Record<string, string>,
): Promise<{ profile: UserProfile; organizationId: string } | Response> {
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, organization_id, project_manager_id')
    .eq('id', projectId)
    .maybeSingle()

  if (error || !project?.organization_id) {
    return jsonResponse({ error: 'Project not found' }, 404, corsHeaders)
  }

  const orgId = project.organization_id as string
  const member = await assertOrgMember(supabase, userId, orgId, corsHeaders)
  if (member instanceof Response) return member

  const { profile } = member
  if (profile.is_super_admin) {
    return { profile, organizationId: orgId }
  }
  if (roleHasPermission(profile, 'can_manage_team')) {
    return { profile, organizationId: orgId }
  }
  if (project.project_manager_id === userId) {
    return { profile, organizationId: orgId }
  }

  const { data: roleRow } = await supabase
    .from('roles')
    .select('permissions')
    .eq('id', profile.role_id ?? '')
    .maybeSingle()

  const perms = roleRow?.permissions as Record<string, unknown> | undefined
  if (perms?.can_edit_projects === true || perms?.can_manage_projects === true) {
    return { profile, organizationId: orgId }
  }

  return jsonResponse({ error: 'Not allowed to manage this project' }, 403, corsHeaders)
}

const FEEDBACK_RECIPIENT = 'chris@siteweave.org'

/** send-email: feedback to fixed address, or org-scoped task emails. */
export async function assertSendEmailAllowed(
  supabase: SupabaseClient,
  userId: string,
  toAddresses: string[],
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const normalized = toAddresses.map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (normalized.length === 0 || normalized.length > 10) {
    return jsonResponse({ error: 'Invalid recipients' }, 400, corsHeaders)
  }

  const allFeedback = normalized.every((e) => e === FEEDBACK_RECIPIENT)
  if (allFeedback) {
    return null
  }

  const profile = await loadProfile(supabase, userId)
  if (!profile?.organization_id) {
    return jsonResponse({ error: 'Not allowed to send external email' }, 403, corsHeaders)
  }

  if (!roleHasPermission(profile, 'can_manage_team') && !profile.is_super_admin) {
    const { data: roleRow } = await supabase
      .from('roles')
      .select('permissions')
      .eq('id', profile.role_id ?? '')
      .maybeSingle()
    const perms = roleRow?.permissions as Record<string, unknown> | undefined
    const canNotify =
      perms?.can_edit_projects === true ||
      perms?.can_manage_projects === true
    if (!canNotify) {
      return jsonResponse({ error: 'Not allowed to send email to recipients' }, 403, corsHeaders)
    }
  }

  const { data: contacts } = await supabase
    .from('contacts')
    .select('email')
    .eq('organization_id', profile.organization_id)
    .in('email', normalized)

  const allowed = new Set((contacts ?? []).map((c) => String(c.email).toLowerCase()))
  const blocked = normalized.filter((e) => !allowed.has(e))
  if (blocked.length > 0) {
    return jsonResponse(
      { error: 'Recipients must be contacts in your organization', blocked },
      403,
      corsHeaders,
    )
  }
  return null
}
