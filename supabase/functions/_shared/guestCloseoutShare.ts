import { generateGuestShareToken, getPublicAppBase, sha256Hex } from './guestShare.ts'

export function buildGuestCloseoutReviewUrl(rawToken: string): string {
  const base = getPublicAppBase()
  return `${base}/guest/punch-list/${encodeURIComponent(rawToken)}`
}

export async function createCloseoutReviewShare(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  opts: {
    projectId: string
    organizationId: string
    createdByUserId?: string | null
  },
): Promise<{ rawToken: string; url: string } | { error: string }> {
  const rawToken = generateGuestShareToken()
  const token_hash = await sha256Hex(rawToken)
  const ttlDays = Math.min(
    365,
    Math.max(1, Number(Deno.env.get('GUEST_CLOSEOUT_REVIEW_TTL_DAYS') || '90') || 90),
  )
  const expires = new Date()
  expires.setUTCDate(expires.getUTCDate() + ttlDays)

  const { error } = await supabase.from('project_closeout_review_tokens').insert({
    token_hash,
    project_id: opts.projectId,
    organization_id: opts.organizationId,
    expires_at: expires.toISOString(),
    created_by_user_id: opts.createdByUserId || null,
  })

  if (error) {
    return { error: error.message }
  }

  return { rawToken, url: buildGuestCloseoutReviewUrl(rawToken) }
}

export async function resolveCloseoutReviewToken(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  rawToken: string,
) {
  const token = String(rawToken || '').trim()
  if (!token) return null
  const token_hash = await sha256Hex(token)
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('project_closeout_review_tokens')
    .select('id, project_id, organization_id, expires_at, revoked_at')
    .eq('token_hash', token_hash)
    .maybeSingle()
  if (error || !data) return null
  if (data.revoked_at) return null
  if (data.expires_at && data.expires_at < now) return null
  return data
}
