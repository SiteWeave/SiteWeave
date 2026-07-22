import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildOptInSmsBody } from './smsCompliance.ts'
import { sendSms } from './signalHouseSms.ts'

export type SmsConsentRow = {
  phone_e164: string
  status: string
  pending_token: string | null
  pending_organization_id: string | null
  pending_sent_at: string | null
  last_opt_in_sent_at: string | null
  last_opt_in_resend_at: string | null
  confirmed_at: string | null
  opted_out_at: string | null
}

const SEVEN_D_MS = 7 * 24 * 60 * 60 * 1000
const RESEND_COOLDOWN_MS = 24 * 60 * 60 * 1000

function randomToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

export async function fetchSmsConsent(
  supabase: SupabaseClient,
  phoneE164: string,
): Promise<SmsConsentRow | null> {
  const { data, error } = await supabase
    .from('sms_phone_consent')
    .select('*')
    .eq('phone_e164', phoneE164)
    .maybeSingle()
  if (error) {
    console.error('fetchSmsConsent:', error.message)
    return null
  }
  return data as SmsConsentRow | null
}

export function canSendSubstantiveSms(row: SmsConsentRow | null): boolean {
  if (!row) return false
  return row.status === 'confirmed'
}

export function isSmsOptedOut(row: SmsConsentRow | null): boolean {
  return Boolean(row?.status === 'opted_out')
}

function withinMs(iso: string | null | undefined, ms: number): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
  return Date.now() - t < ms
}

/**
 * Sends opt-in SMS if allowed by rate limits. Does not send substantive content.
 * @param forceResend — allows one extra send after RESEND_COOLDOWN_MS even if within 7d window (PM "Resend").
 */
export async function sendOptInIfEligible(
  supabase: SupabaseClient,
  opts: {
    phoneE164: string
    organizationId: string
    organizationName: string
    forceResend?: boolean
  },
): Promise<{ sent: boolean; reason?: string; sid?: string; token?: string }> {
  const { phoneE164, organizationId, organizationName, forceResend } = opts
  const row = await fetchSmsConsent(supabase, phoneE164)

  if (row?.status === 'opted_out') {
    return { sent: false, reason: 'opted_out' }
  }
  if (row?.status === 'confirmed') {
    return { sent: false, reason: 'already_confirmed' }
  }

  const lastAny = row?.last_opt_in_sent_at || null
  if (lastAny && withinMs(lastAny, SEVEN_D_MS) && !forceResend) {
    return { sent: false, reason: 'rate_limited_7d' }
  }
  if (forceResend && row?.last_opt_in_resend_at && withinMs(row.last_opt_in_resend_at, RESEND_COOLDOWN_MS)) {
    return { sent: false, reason: 'rate_limited_resend_24h' }
  }

  const token = randomToken()
  const body = buildOptInSmsBody(organizationName, token)

  const smsResult = await sendSms({ to: phoneE164, body })
  if (!smsResult.success) {
    return { sent: false, reason: smsResult.error || 'sms_send_failed' }
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    phone_e164: phoneE164,
    status: 'pending',
    pending_token: token,
    pending_organization_id: organizationId,
    pending_sent_at: now,
    last_opt_in_sent_at: now,
    last_opt_in_message_sid: smsResult.sid || null,
    updated_at: now,
  }
  if (forceResend) {
    patch.last_opt_in_resend_at = now
  }

  const { error: upsertErr } = await supabase.from('sms_phone_consent').upsert(patch, {
    onConflict: 'phone_e164',
  })
  if (upsertErr) {
    console.error('sms_phone_consent upsert:', upsertErr.message)
    return { sent: false, reason: upsertErr.message }
  }

  return { sent: true, sid: smsResult.sid, token }
}

/**
 * If substantive SMS is allowed, returns { allowed: true }.
 * If not, attempts opt-in once (unless opted_out / rate limited) and returns allowed: false with reason.
 */
export async function gateOrSendOptInForSubstantiveSms(
  supabase: SupabaseClient,
  opts: {
    phoneE164: string
    organizationId: string
    organizationName: string
    forceResend?: boolean
  },
): Promise<{ allowed: boolean; optInSent?: boolean; reason?: string }> {
  const row = await fetchSmsConsent(supabase, opts.phoneE164)
  if (isSmsOptedOut(row)) {
    return { allowed: false, reason: 'opted_out' }
  }
  if (canSendSubstantiveSms(row)) {
    return { allowed: true }
  }
  const opt = await sendOptInIfEligible(supabase, opts)
  if (opt.sent) {
    return { allowed: false, optInSent: true, reason: 'opt_in_sent' }
  }
  return { allowed: false, reason: opt.reason || 'consent_required' }
}
