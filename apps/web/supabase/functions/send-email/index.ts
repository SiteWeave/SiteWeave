// Supabase Edge Function for sending emails
// Deploy this function with: supabase functions deploy send-email

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeadersFor, corsPreflightResponse } from '../_shared/cors.ts'
import {
  assertSendEmailAllowed,
  createServiceClient,
  jsonResponse,
  requireUser,
} from '../_shared/auth.ts'
import { parseSendEmailBody } from '../_shared/schemas/sendEmail.ts'
import { sendTransactionalEmail } from '../_shared/transactionalEmailLayout.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const MAX_SUBJECT_LEN = 200
const MAX_BODY_LEN = 50_000

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: corsHeaders
    })
  }

  try {
    const authResult = await requireUser(req, corsHeaders)
    if (authResult instanceof Response) return authResult
    const { user } = authResult

    const parsed = parseSendEmailBody(await req.json())
    if (!parsed.success) {
      return jsonResponse(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        400,
        corsHeaders,
      )
    }

    const { to, subject, html, text } = parsed.data
    const toArray = (Array.isArray(to) ? to : [to]).map((e) => e.trim().toLowerCase())

    const supabaseAdmin = createServiceClient()
    const sendDenied = await assertSendEmailAllowed(supabaseAdmin, user.id, toArray, corsHeaders)
    if (sendDenied) return sendDenied

    // Option 1: Use Resend (recommended for production)
    if (RESEND_API_KEY) {
      const sendResult = await sendTransactionalEmail({
        to: toArray,
        subject,
        html: html ?? '',
        text: text ?? html ?? '',
      })

      if (!sendResult.success) {
        console.error('Resend error:', sendResult.error)
        return new Response(
          JSON.stringify({ error: 'Failed to send email via Resend', details: sendResult.error }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        )
      }

      return new Response(
        JSON.stringify({ success: true, id: sendResult.id }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // Option 2: Use Supabase Auth email (for testing/development)
    // Note: This uses Supabase's built-in email service, which has rate limits
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // For development, we can use a workaround by creating a custom email
    // In production, you should use a proper email service like Resend, SendGrid, or AWS SES
    
    console.log('Email would be sent to:', to)
    console.log('Subject:', subject)
    console.log('Body preview:', text?.substring(0, 100) || html?.substring(0, 100))

    // Return success (in dev mode, emails won't actually be sent without a proper service)
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email logged (configure RESEND_API_KEY for actual sending)',
        to,
        subject 
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        } 
      }
    )

  } catch (error) {
    console.error('Error in send-email function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        } 
      }
    )
  }
})

