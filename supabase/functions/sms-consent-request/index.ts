import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createServiceClient } from '../_shared/auth.ts'
import { corsHeadersFor, corsPreflightResponse } from '../_shared/cors.ts'
import { fetchSmsConsent } from '../_shared/smsConsent.ts'
import {
  fetchConsentRequestByToken,
  isConsentRequestExpired,
  maskPhoneE164,
} from '../_shared/smsWebConsent.ts'

function parseToken(req: Request, body?: Record<string, unknown>): string | null {
  const fromBody = body?.token ? String(body.token).trim() : ''
  if (fromBody) return fromBody
  const auth = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  if (auth.startsWith('Bearer ')) {
    const t = auth.slice(7).trim()
    if (t) return t
  }
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('token')
  return fromQuery?.trim() || null
}

serve(async (req) => {
  const corsHeaders = {
    ...corsHeadersFor(req),
    'Access-Control-Allow-Origin': '*',
  }

  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    let body: Record<string, unknown> = {}
    if (req.method === 'POST') {
      try {
        body = await req.json()
      } catch {
        body = {}
      }
    }

    const token = parseToken(req, body)
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const supabase = createServiceClient()
    const row = await fetchConsentRequestByToken(supabase, token)
    if (!row) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', row.organization_id)
      .maybeSingle()

    const phoneConsent = await fetchSmsConsent(supabase, row.phone_e164)
    const expired = row.status === 'expired' || isConsentRequestExpired(row.expires_at)
    const effectiveStatus =
      phoneConsent?.status === 'opted_out'
        ? 'opted_out'
        : row.status === 'confirmed' || phoneConsent?.status === 'confirmed'
          ? 'confirmed'
          : expired
            ? 'expired'
            : row.status

    return new Response(
      JSON.stringify({
        organizationName: org?.name || 'Your team',
        maskedPhone: maskPhoneE164(row.phone_e164),
        expiresAt: row.expires_at,
        status: effectiveStatus,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  } catch (e) {
    console.error('sms-consent-request:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
