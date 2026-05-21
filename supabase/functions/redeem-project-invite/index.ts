import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { sha256Hex } from '../_shared/guestShare.ts'
import {
  countProjectGuestSeats,
  getOrganizationTier,
  GUEST_COLLABORATOR_LIMIT_ERROR,
  isPersonalWorkspace,
} from '../_shared/workspaceTier.ts'
import { corsHeaders, corsPreflightResponse } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt)
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const body = await req.json()
    const { token, shortCode } = body

    if (!token && !shortCode) {
      throw new Error('token or shortCode required')
    }

    let invite = null

    if (token) {
      const token_hash = await sha256Hex(String(token).trim())
      const { data, error } = await supabaseAdmin
        .from('project_access_invites')
        .select('*')
        .eq('token_hash', token_hash)
        .eq('status', 'pending')
        .maybeSingle()
      if (error) throw error
      invite = data
    } else {
      const { data, error } = await supabaseAdmin
        .from('project_access_invites')
        .select('*')
        .eq('short_code', String(shortCode).trim().toUpperCase())
        .eq('status', 'pending')
        .maybeSingle()
      if (error) throw error
      invite = data
    }

    if (!invite) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invite not found or already used' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (new Date(invite.expires_at) < new Date()) {
      await supabaseAdmin
        .from('project_access_invites')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', invite.id)
      throw new Error('Invite has expired')
    }

    const { data: existingCollab } = await supabaseAdmin
      .from('project_collaborators')
      .select('id')
      .eq('project_id', invite.project_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!existingCollab) {
      const seats = await countProjectGuestSeats(supabaseAdmin, invite.project_id)
      const org = await getOrganizationTier(supabaseAdmin, invite.organization_id)
      const cap = org?.max_guest_collaborators_per_project ?? 5
      const effectiveSeats = org && isPersonalWorkspace(org) ? Math.max(0, seats - 1) : seats
      if (org && isPersonalWorkspace(org) && effectiveSeats >= cap) {
        return new Response(
          JSON.stringify({
            success: false,
            error: GUEST_COLLABORATOR_LIMIT_ERROR,
            message: 'This project has reached the guest collaborator limit for a personal workspace.',
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    const { error: collabError } = await supabaseAdmin
      .from('project_collaborators')
      .upsert({
        project_id: invite.project_id,
        user_id: user.id,
        organization_id: invite.organization_id,
        access_level: invite.access_level || 'viewer',
        invited_by_user_id: invite.invited_by_user_id,
      }, { onConflict: 'project_id,user_id' })

    if (collabError) throw collabError

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, contact_id, organization_id, account_intent')
      .eq('id', user.id)
      .maybeSingle()

    const profileUpdate: Record<string, unknown> = {}
    if (!profile?.contact_id && invite.contact_id) {
      profileUpdate.contact_id = invite.contact_id
    }
    if (!profile) {
      profileUpdate.id = user.id
      profileUpdate.account_intent = 'guest_only'
      profileUpdate.role = 'Team'
    }

    if (Object.keys(profileUpdate).length > 0) {
      await supabaseAdmin.from('profiles').upsert({
        id: user.id,
        ...profileUpdate,
      }, { onConflict: 'id' })
    }

    await supabaseAdmin
      .from('project_access_invites')
      .update({
        status: 'accepted',
        accepted_by_user_id: user.id,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', invite.id)

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, name')
      .eq('id', invite.project_id)
      .single()

    return new Response(
      JSON.stringify({
        success: true,
        projectId: invite.project_id,
        projectName: project?.name,
        organizationId: invite.organization_id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('redeem-project-invite:', error)
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
