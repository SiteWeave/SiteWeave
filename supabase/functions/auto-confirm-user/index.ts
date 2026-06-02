// Supabase Edge Function: auto-confirm-user
// Auto-confirms a user account during invitation acceptance
// This bypasses email confirmation requirements for invited users

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeadersFor, corsPreflightResponse } from '../_shared/cors.ts'
import { jsonResponse, requireUser } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
}

const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }
})

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req)
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    })
  }

  try {
    const authResult = await requireUser(req, corsHeaders)
    if (authResult instanceof Response) return authResult
    const { user: caller } = authResult

    const { userId } = await req.json()

    console.log('auto-confirm-user called with userId:', userId)

    if (!userId) {
      return jsonResponse({ error: 'Missing required field: userId' }, 400, corsHeaders)
    }

    if (userId !== caller.id) {
      return jsonResponse({ error: 'You may only confirm your own account' }, 403, corsHeaders)
    }

    // Get the user
    const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId)
    
    if (getUserError || !userData?.user) {
      console.error('Error getting user:', getUserError)
      return new Response(
        JSON.stringify({ error: `User not found: ${getUserError?.message || 'Unknown error'}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is already confirmed
    if (userData.user.email_confirmed_at) {
      console.log('User already confirmed:', userId)
      return new Response(
        JSON.stringify({ success: true, alreadyConfirmed: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Auto-confirm the user
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { email_confirm: true }
    )

    if (updateError) {
      console.error('Error confirming user:', updateError)
      return new Response(
        JSON.stringify({ error: `Failed to confirm user: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('User confirmed successfully:', userId)
    return new Response(
      JSON.stringify({ success: true, userId: userId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in auto-confirm-user:', error)
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
