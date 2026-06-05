/**
 * Simple sliding-window rate limiting via Postgres (service role).
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WINDOW_MS = 60_000

async function hashKey(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  bucketKey: string,
  maxRequests: number,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const keyHash = await hashKey(bucketKey)
  const now = Date.now()
  const windowStart = new Date(now - WINDOW_MS).toISOString()

  const { data: row } = await supabase
    .from('rate_limit_buckets')
    .select('id, request_count, window_start')
    .eq('bucket_key', keyHash)
    .maybeSingle()

  if (!row) {
    await supabase.from('rate_limit_buckets').insert({
      bucket_key: keyHash,
      request_count: 1,
      window_start: new Date(now).toISOString(),
    })
    return { allowed: true }
  }

  const rowStart = new Date(row.window_start).getTime()
  if (rowStart < now - WINDOW_MS) {
    await supabase
      .from('rate_limit_buckets')
      .update({ request_count: 1, window_start: new Date(now).toISOString() })
      .eq('id', row.id)
    return { allowed: true }
  }

  if (row.request_count >= maxRequests) {
    const retryAfterSec = Math.ceil((rowStart + WINDOW_MS - now) / 1000)
    return { allowed: false, retryAfterSec: Math.max(1, retryAfterSec) }
  }

  await supabase
    .from('rate_limit_buckets')
    .update({ request_count: row.request_count + 1 })
    .eq('id', row.id)

  return { allowed: true }
}

export async function enforceRateLimit(
  supabase: SupabaseClient,
  req: Request,
  route: string,
  limits: { ipMax: number; tokenMax?: number },
  tokenPrefix?: string | null,
): Promise<Response | null> {
  const ip = clientIp(req)
  const ipKey = `${route}:ip:${ip}`
  const ipCheck = await checkRateLimit(supabase, ipKey, limits.ipMax)
  if (!ipCheck.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests', retry_after: ipCheck.retryAfterSec }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(ipCheck.retryAfterSec ?? 60),
        },
      },
    )
  }

  if (limits.tokenMax && tokenPrefix) {
    const tokenKey = `${route}:token:${tokenPrefix.slice(0, 16)}`
    const tokenCheck = await checkRateLimit(supabase, tokenKey, limits.tokenMax)
    if (!tokenCheck.allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many requests for this link', retry_after: tokenCheck.retryAfterSec }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(tokenCheck.retryAfterSec ?? 60),
          },
        },
      )
    }
  }

  return null
}
