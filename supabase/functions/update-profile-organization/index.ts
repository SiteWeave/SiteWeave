// Supabase Edge Function: update-profile-organization
// Updates a user's profile with organization and role assignment
// Uses service role to bypass RLS - useful when user doesn't have a session yet

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveMemberRoleId } from '../_shared/ensureDefaultRoles.ts'

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
    const { userId, organizationId, roleId, contactId } = await req.json()

    console.log('update-profile-organization called with:', { userId, organizationId, roleId, contactId })

    if (!userId || !organizationId) {
      console.error('Missing required fields:', { userId: !!userId, organizationId: !!organizationId })
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, organizationId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify user exists
    const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId)
    
    if (getUserError || !userData?.user) {
      console.error('Error getting user:', getUserError)
      return new Response(
        JSON.stringify({ error: `User not found: ${getUserError?.message || 'Unknown error'}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const resolvedRoleId = await resolveMemberRoleId(supabaseAdmin, organizationId, roleId)

    const updateData: Record<string, unknown> = {
      organization_id: organizationId,
      role_id: resolvedRoleId,
    }
    
    if (contactId) {
      updateData.contact_id = contactId
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', userId)

    if (updateError) {
      console.error('Error updating profile:', updateError)
      return new Response(
        JSON.stringify({ error: `Failed to update profile: ${updateError.message}`, details: updateError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Profile updated successfully:', userId)
    return new Response(
      JSON.stringify({ success: true, userId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in update-profile-organization:', error)
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
