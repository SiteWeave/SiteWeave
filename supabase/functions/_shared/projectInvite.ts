import { getPublicAppBase, generateGuestShareToken, sha256Hex } from './guestShare.ts'

export function buildProjectInviteUrl(rawToken: string): string {
  const base = getPublicAppBase()
  return `${base}/project-invite/${encodeURIComponent(rawToken)}`
}

export function generateShortCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => chars[b % chars.length]).join('')
}

export async function createProjectAccessInvite(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  opts: {
    projectId: string
    organizationId: string
    contactId: string | null
    invitedEmail: string
    accessLevel?: string
    invitedByUserId?: string | null
  },
): Promise<{ rawToken: string; inviteUrl: string; shortCode: string; inviteId: string } | { error: string }> {
  const rawToken = generateGuestShareToken()
  const token_hash = await sha256Hex(rawToken)
  const shortCode = generateShortCode()
  const ttlDays = Math.min(90, Math.max(7, Number(Deno.env.get('PROJECT_INVITE_TTL_DAYS') || '30') || 30))
  const expires = new Date()
  expires.setUTCDate(expires.getUTCDate() + ttlDays)

  const { data, error } = await supabase
    .from('project_access_invites')
    .insert({
      project_id: opts.projectId,
      organization_id: opts.organizationId,
      contact_id: opts.contactId,
      invited_email: opts.invitedEmail.trim().toLowerCase(),
      token_hash,
      short_code: shortCode,
      access_level: opts.accessLevel || 'viewer',
      status: 'pending',
      invited_by_user_id: opts.invitedByUserId || null,
      expires_at: expires.toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    return { error: error.message }
  }

  return {
    rawToken,
    inviteUrl: buildProjectInviteUrl(rawToken),
    shortCode,
    inviteId: data.id,
  }
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function mapRoleToAccessLevel(role: string): string {
  const r = (role || '').toLowerCase()
  if (r.includes('admin') || r === 'owner') return 'admin'
  if (r.includes('pm') || r.includes('manager') || r.includes('editor')) return 'editor'
  return 'viewer'
}
