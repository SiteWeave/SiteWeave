// Supabase Edge Function: create-contact-for-invitation
// Creates a contact record for a newly signed-up user during invitation acceptance
// Uses service role to bypass RLS

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
}

const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    })
  }

  try {
    const { userId, email, name, organizationId } = await req.json()

    console.log('create-contact-for-invitation called with:', { userId, email, name, organizationId })

    if (!userId || !email || !organizationId) {
      console.error('Missing required fields:', { userId: !!userId, email: !!email, organizationId: !!organizationId })
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, email, organizationId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if contact already exists
    const { data: existingContact, error: checkError } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .ilike('email', email)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (checkError) {
      console.error('Error checking for existing contact:', checkError)
      return new Response(
        JSON.stringify({ error: `Failed to check for existing contact: ${checkError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (existingContact) {
      console.log('Contact already exists:', existingContact.id)
      return new Response(
        JSON.stringify({ success: true, contactId: existingContact.id, existing: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create new contact
    const { data: newContact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .insert({
        name: name || email.split('@')[0] || 'User',
        email: email.toLowerCase(),
        role: 'Team Member',
        type: 'Team',
        organization_id: organizationId,
        status: 'Available',
        created_by_user_id: userId
      })
      .select('id')
      .single()

    if (contactError) {
      console.error('Error creating contact:', contactError)
      return new Response(
        JSON.stringify({ error: `Failed to create contact: ${contactError.message}`, details: contactError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Contact created successfully:', newContact.id)
    return new Response(
      JSON.stringify({ success: true, contactId: newContact.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in create-contact-for-invitation:', error)
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
