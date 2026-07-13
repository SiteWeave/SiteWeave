import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createServiceClient } from '../_shared/auth.ts'
import { corsHeadersFor, corsPreflightResponse } from '../_shared/cors.ts'
import { confirmWebSmsConsent } from '../_shared/smsWebConsent.ts'
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts'

serve(async (req) => {
  const corsHeaders = {
    ...corsHeadersFor(req),
    'Access-Control-Allow-Origin': '*',
  }

  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const token = String(body?.token || '').trim()
    const agreed = body?.agreed === true

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    if (!agreed) {
      return new Response(JSON.stringify({ error: 'agreed must be true' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const supabase = createServiceClient()
    const ip = clientIp(req)

    const rateCheck = await checkRateLimit(supabase, `sms_web_consent_confirm:${ip}:${token.slice(0, 8)}`, 10)
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const result = await confirmWebSmsConsent(supabase, { token })
    if (!result.ok) {
      const status =
        result.reason === 'not_found'
          ? 404
          : result.reason === 'opted_out'
            ? 403
            : 400
      return new Response(JSON.stringify({ ok: false, reason: result.reason }), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    return new Response(JSON.stringify({ ok: true, reason: result.reason || 'confirmed' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (e) {
    console.error('confirm-sms-web-consent:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
