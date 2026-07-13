import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizeAssigneePhone } from '../_shared/phone.ts'
import {
  buildHelpSmsBody,
  buildOptInConfirmedSmsBody,
  buildOptOutConfirmedSmsBody,
} from '../_shared/smsCompliance.ts'
import { validateTwilioRequestSignature, resolveTwilioWebhookFullUrl } from '../_shared/twilioSignature.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function twimlMessage(text: string): Response {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(
      text,
    )}</Message></Response>`
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function parseYesToken(body: string): { yes: boolean; token: string | null } {
  const raw = body.trim()
  const upper = raw.toUpperCase()
  const m = upper.match(/^YES\s+([A-Z0-9]{6})\s*$/)
  if (m) return { yes: true, token: m[1] }
  if (upper === 'YES' || upper === 'Y') return { yes: true, token: null }
  return { yes: false, token: null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const authToken = (Deno.env.get('TWILIO_AUTH_TOKEN') || '').trim()
  if (!authToken) {
    console.error('TWILIO_AUTH_TOKEN not set; cannot verify inbound SMS')
    return new Response('Forbidden', { status: 403 })
  }

  const bodyText = await req.text()
  const signature = req.headers.get('X-Twilio-Signature')
  const fullUrl = resolveTwilioWebhookFullUrl(req)
  const ok = await validateTwilioRequestSignature(fullUrl, bodyText, signature, authToken)
  if (!ok) {
    console.warn('Twilio signature verification failed')
    return new Response('Forbidden', { status: 403 })
  }

  const params = new URLSearchParams(bodyText)
  const fromRaw = params.get('From') || ''
  const body = params.get('Body') || ''
  const messageSid = params.get('MessageSid') || null

  const { e164, isValid } = normalizeAssigneePhone(fromRaw)
  if (!isValid || !e164) {
    return new Response('', { status: 200, headers: { 'Content-Type': 'text/xml' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  const supabase = createClient(supabaseUrl, supabaseKey)

  const trimmedUpper = body.trim().toUpperCase()
  if (trimmedUpper.startsWith('STOP') || trimmedUpper === 'STOPALL' || trimmedUpper === 'UNSUBSCRIBE') {
    const now = new Date().toISOString()
    await supabase.from('sms_phone_consent').upsert(
      {
        phone_e164: e164,
        status: 'opted_out',
        opted_out_at: now,
        pending_token: null,
        pending_organization_id: null,
        pending_sent_at: null,
        updated_at: now,
      },
      { onConflict: 'phone_e164' },
    )
    return twimlMessage(buildOptOutConfirmedSmsBody())
  }

  if (trimmedUpper.startsWith('HELP')) {
    return twimlMessage(buildHelpSmsBody())
  }

  const { yes, token } = parseYesToken(body)
  if (!yes) {
    return new Response('', { status: 200, headers: { 'Content-Type': 'text/xml' } })
  }

  let row: { phone_e164: string; pending_token: string | null; status: string } | null = null

  if (token) {
    const { data } = await supabase
      .from('sms_phone_consent')
      .select('phone_e164, pending_token, status')
      .eq('pending_token', token)
      .maybeSingle()
    row = data as typeof row
    if (row && row.phone_e164 !== e164) {
      console.warn('YES token phone mismatch', { token, from: e164, rowPhone: row.phone_e164 })
      row = null
    }
  } else {
    const { data } = await supabase
      .from('sms_phone_consent')
      .select('phone_e164, pending_token, status')
      .eq('phone_e164', e164)
      .eq('status', 'pending')
      .maybeSingle()
    row = data as typeof row
  }

  if (!row || row.status !== 'pending') {
    return twimlMessage('No pending SMS signup found for this number. If you need help, contact your project admin.')
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('sms_phone_consent')
    .update({
      status: 'confirmed',
      confirmed_at: now,
      consent_method: 'sms_reply',
      pending_token: null,
      pending_organization_id: null,
      pending_sent_at: null,
      last_confirm_inbound_sid: messageSid,
      updated_at: now,
    })
    .eq('phone_e164', e164)

  if (error) {
    console.error('confirm sms consent:', error.message)
    return new Response('Error', { status: 500 })
  }

  return twimlMessage(buildOptInConfirmedSmsBody())
})
