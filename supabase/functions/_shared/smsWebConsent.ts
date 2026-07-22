import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildOptInConfirmedSmsBody } from './smsCompliance.ts'
import { sendSms } from './signalHouseSms.ts'
import { isSmsNotificationsEnabled } from './smsNotifications.ts'

export const SMS_CONSENT_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000

const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz'

export function generateConsentToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let token = ''
  for (let i = 0; i < 32; i++) {
    token += TOKEN_CHARS[bytes[i] % TOKEN_CHARS.length]
  }
  return token
}

export function buildPublicAppBaseUrl(): string {
  return (
    Deno.env.get('PUBLIC_APP_URL') ||
    Deno.env.get('DESKTOP_APP_URL') ||
    'https://app.siteweave.org'
  ).replace(/\/$/, '')
}

export function buildSmsConsentPageUrl(token: string): string {
  return `${buildPublicAppBaseUrl()}/sms-consent/${encodeURIComponent(token)}`
}

/** Mask E.164 for display, e.g. +1 (***) ***-1234 */
export function maskPhoneE164(e164: string): string {
  const digits = String(e164 || '').replace(/\D/g, '')
  if (digits.length < 4) return '***'
  const last4 = digits.slice(-4)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (***) ***-${last4}`
  }
  const cc = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : ''
  return `${cc}(***) ***-${last4}`
}

export function isConsentRequestExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true
  const t = new Date(expiresAt).getTime()
  return Number.isNaN(t) || t <= Date.now()
}

export type SmsConsentRequestRow = {
  token: string
  phone_e164: string
  organization_id: string
  contact_id: string | null
  created_by: string
  status: string
  expires_at: string
  confirmed_at: string | null
  consent_method: string | null
}

export async function fetchConsentRequestByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<SmsConsentRequestRow | null> {
  const { data, error } = await supabase
    .from('sms_consent_requests')
    .select('*')
    .eq('token', token)
    .maybeSingle()
  if (error) {
    console.error('fetchConsentRequestByToken:', error.message)
    return null
  }
  return data as SmsConsentRequestRow | null
}

export async function confirmWebSmsConsent(
  supabase: SupabaseClient,
  opts: {
    token: string
    organizationName?: string
  },
): Promise<{ ok: boolean; reason?: string; phoneE164?: string }> {
  const row = await fetchConsentRequestByToken(supabase, opts.token)
  if (!row) return { ok: false, reason: 'not_found' }
  if (row.status === 'confirmed') return { ok: true, phoneE164: row.phone_e164, reason: 'already_confirmed' }
  if (row.status === 'revoked') return { ok: false, reason: 'revoked' }
  if (row.status === 'expired' || isConsentRequestExpired(row.expires_at)) {
    await supabase
      .from('sms_consent_requests')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('token', opts.token)
      .eq('status', 'pending')
    return { ok: false, reason: 'expired' }
  }

  const { data: phoneRow } = await supabase
    .from('sms_phone_consent')
    .select('status')
    .eq('phone_e164', row.phone_e164)
    .maybeSingle()

  if (phoneRow?.status === 'opted_out') {
    return { ok: false, reason: 'opted_out' }
  }

  const now = new Date().toISOString()

  const { error: requestErr } = await supabase
    .from('sms_consent_requests')
    .update({
      status: 'confirmed',
      confirmed_at: now,
      consent_method: 'web_form',
      updated_at: now,
    })
    .eq('token', opts.token)
    .eq('status', 'pending')

  if (requestErr) {
    console.error('confirmWebSmsConsent request update:', requestErr.message)
    return { ok: false, reason: requestErr.message }
  }

  const { error: consentErr } = await supabase.from('sms_phone_consent').upsert(
    {
      phone_e164: row.phone_e164,
      status: 'confirmed',
      confirmed_at: now,
      consent_method: 'web_form',
      pending_organization_id: row.organization_id,
      pending_token: null,
      updated_at: now,
    },
    { onConflict: 'phone_e164' },
  )

  if (consentErr) {
    console.error('confirmWebSmsConsent phone upsert:', consentErr.message)
    await supabase
      .from('sms_consent_requests')
      .update({
        status: 'pending',
        confirmed_at: null,
        consent_method: null,
        updated_at: new Date().toISOString(),
      })
      .eq('token', opts.token)
      .eq('status', 'confirmed')
    return { ok: false, reason: consentErr.message }
  }

  if (isSmsNotificationsEnabled()) {
    const body = buildOptInConfirmedSmsBody()
    const smsResult = await sendSms({ to: row.phone_e164, body })
    if (!smsResult.success) {
      console.warn('confirmWebSmsConsent confirmation SMS failed:', smsResult.error)
    }
  }

  return { ok: true, phoneE164: row.phone_e164 }
}
