import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    let token = url.searchParams.get('token')?.trim() || ''

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      if (body?.token) token = String(body.token).trim()
    }

    if (!token) {
      return new Response(JSON.stringify({ success: false, error: 'Missing token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: recipient, error: findError } = await supabase
      .from('progress_report_recipients')
      .select('id, email, is_active, schedule_id')
      .eq('unsubscribe_token', token)
      .maybeSingle()

    if (findError) throw findError
    if (!recipient) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid or expired unsubscribe link' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    if (recipient.is_active === false) {
      return new Response(
        JSON.stringify({
          success: true,
          already_unsubscribed: true,
          email: recipient.email,
          message: 'You are already unsubscribed from this progress report.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const { error: updateError } = await supabase
      .from('progress_report_recipients')
      .update({ is_active: false })
      .eq('id', recipient.id)

    if (updateError) throw updateError

    return new Response(
      JSON.stringify({
        success: true,
        email: recipient.email,
        message: 'You have been unsubscribed from this progress report.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  } catch (error) {
    console.error('unsubscribe-progress-report:', error)
    return new Response(
      JSON.stringify({ success: false, error: error?.message || String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
})
