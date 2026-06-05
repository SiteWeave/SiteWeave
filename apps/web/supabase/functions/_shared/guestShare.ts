export type GuestShareSource =
  | 'task_start'
  | 'manual_reminder'
  | 'dependency_unlocked'

export function getPublicAppBase(): string {
  const base =
    Deno.env.get('PUBLIC_APP_URL')?.trim() ||
    Deno.env.get('DESKTOP_APP_URL')?.trim() ||
    'https://app.siteweave.org'
  return base.replace(/\/$/, '')
}

/** 32 bytes hex (64 chars) — unguessable opaque token */
export function generateGuestShareToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function buildGuestTaskShareUrl(rawToken: string): string {
  const base = getPublicAppBase()
  return `${base}/guest/tasks/${encodeURIComponent(rawToken)}`
}

export async function createGuestShare(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  opts: {
    projectId: string
    organizationId: string
    taskIds: string[]
    source: GuestShareSource
  },
): Promise<{ rawToken: string; url: string } | { error: string }> {
  const uniqueIds = Array.from(new Set((opts.taskIds || []).filter(Boolean)))
  if (uniqueIds.length === 0) {
    return { error: 'task_ids required' }
  }

  const rawToken = generateGuestShareToken()
  const token_hash = await sha256Hex(rawToken)
  const ttlDays = Math.min(
    365,
    Math.max(1, Number(Deno.env.get('GUEST_TASK_SHARE_TTL_DAYS') || '90') || 90),
  )
  const expires = new Date()
  expires.setUTCDate(expires.getUTCDate() + ttlDays)

  const { error } = await supabase.from('task_notification_guest_shares').insert({
    token_hash,
    project_id: opts.projectId,
    organization_id: opts.organizationId,
    task_ids: uniqueIds,
    source: opts.source,
    expires_at: expires.toISOString(),
  })

  if (error) {
    return { error: error.message }
  }

  return { rawToken, url: buildGuestTaskShareUrl(rawToken) }
}
