import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizeAssigneePhone } from '../_shared/phone.ts'
import {
  buildHelpSmsBody,
  buildOptInConfirmedSmsBody,
  buildOptOutConfirmedSmsBody,
} from '../_shared/smsCompliance.ts'
import { sendSms } from '../_shared/signalHouseSms.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-signal-house-secret, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function parseYesToken(body: string): { yes: boolean; token: string | null } {
  const raw = body.trim()
  const upper = raw.toUpperCase()
  const m = upper.match(/^YES\s+([A-Z0-9]{6})\s*$/)
  if (m) return { yes: true, token: m[1] }
  if (upper === 'YES' || upper === 'Y') return { yes: true, token: null }
  return { yes: false, token: null }
}

function jsonOk(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Extract inbound fields from Signal House (and common alternate shapes). */
function parseInboundPayload(raw: unknown): {
  fromRaw: string
  body: string
  messageId: string | null
} {
  if (raw == null) return { fromRaw: '', body: '', messageId: null }

  if (typeof raw === 'string') {
    try {
      return parseInboundPayload(JSON.parse(raw))
    } catch {
      const params = new URLSearchParams(raw)
      return {
        fromRaw: params.get('From') || params.get('from') || params.get('senderPhoneNumber') || '',
        body: params.get('Body') || params.get('body') || params.get('messageBody') || '',
        messageId: params.get('MessageSid') || params.get('messageId') || params.get('id') || null,
      }
    }
  }

  if (typeof raw !== 'object') return { fromRaw: '', body: '', messageId: null }
  const obj = raw as Record<string, unknown>
  const nested =
    (obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : null) ||
    (obj.message && typeof obj.message === 'object' ? (obj.message as Record<string, unknown>) : null) ||
    obj

  const fromRaw = String(
    nested.senderPhoneNumber ||
      nested.from ||
      nested.From ||
      nested.fromPhoneNumber ||
      nested.from_number ||
      '',
  )
  const body = String(
    nested.messageBody || nested.body || nested.Body || nested.text || nested.message || '',
  )
  const messageIdRaw =
    nested.id || nested.messageId || nested.message_id || nested.MessageSid || null
  const messageId = messageIdRaw != null ? String(messageIdRaw) : null

  return { fromRaw, body, messageId }
}

function verifyWebhookSecret(req: Request, url: URL): boolean {
  const expected = (Deno.env.get('SIGNAL_HOUSE_WEBHOOK_SECRET') || '').trim()
  if (!expected) return true

  const header =
    req.headers.get('x-signal-house-secret') ||
    req.headers.get('x-webhook-secret') ||
    ''
  const query = url.searchParams.get('secret') || ''
  return header === expected || query === expected
}

async function replySms(toE164: string, text: string): Promise<void> {
  const result = await sendSms({ to: toE164, body: text })
  if (!result.success) {
    console.error('signalhouse inbound reply failed:', result.error)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const url = new URL(req.url)
  if (!verifyWebhookSecret(req, url)) {
    console.warn('Signal House webhook secret verification failed')
    return new Response('Forbidden', { status: 403 })
  }

  const bodyText = await req.text()
  let parsed: unknown = bodyText
  const contentType = (req.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('application/json')) {
    try {
      parsed = JSON.parse(bodyText)
    } catch {
      parsed = bodyText
    }
  }

  const { fromRaw, body, messageId } = parseInboundPayload(parsed)
  const { e164, isValid } = normalizeAssigneePhone(fromRaw)
  if (!isValid || !e164) {
    return jsonOk()
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
    await replySms(e164, buildOptOutConfirmedSmsBody())
    return jsonOk()
  }

  if (trimmedUpper.startsWith('HELP')) {
    await replySms(e164, buildHelpSmsBody())
    return jsonOk()
  }

  const { yes, token } = parseYesToken(body)
  if (!yes) {
    return jsonOk()
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
    await replySms(
      e164,
      'No pending SMS signup found for this number. If you need help, contact your project admin.',
    )
    return jsonOk()
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
      last_confirm_inbound_sid: messageId,
      updated_at: now,
    })
    .eq('phone_e164', e164)

  if (error) {
    console.error('confirm sms consent:', error.message)
    return new Response('Error', { status: 500, headers: corsHeaders })
  }

  await replySms(e164, buildOptInConfirmedSmsBody())
  return jsonOk()
})
