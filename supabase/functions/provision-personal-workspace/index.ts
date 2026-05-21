import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders, corsPreflightResponse } from '../_shared/cors.ts'

const ORG_ADMIN_PERMISSIONS = {
  can_manage_team: true,
  can_manage_users: true,
  can_manage_roles: true,
  can_create_projects: true,
  can_edit_projects: true,
  can_delete_projects: true,
  can_assign_tasks: true,
  can_manage_contacts: true,
  can_create_tasks: true,
  can_edit_tasks: true,
  can_delete_tasks: true,
  can_send_messages: true,
  can_manage_progress_reports: true,
  can_manage_org_progress_reports: true,
}

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

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, organization_id, account_intent, contact_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) throw profileError

    const accountIntent = profile?.account_intent || user.user_metadata?.account_intent || 'workspace_owner'
    if (accountIntent === 'guest_only') {
      return new Response(
        JSON.stringify({ success: false, error: 'Guest accounts cannot provision a personal workspace' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (profile?.organization_id) {
      const { data: existingOrg } = await supabaseAdmin
        .from('organizations')
        .select('*')
        .eq('id', profile.organization_id)
        .single()
      return new Response(
        JSON.stringify({ success: true, organization: existingOrg, alreadyProvisioned: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { count: collabCount } = await supabaseAdmin
      .from('project_collaborators')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const forceProvision = body?.force === true

    if ((collabCount ?? 0) > 0 && !forceProvision) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'User has guest project access; use force=true to create a personal workspace anyway',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const fullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'My'
    const workspaceName = `${fullName}'s Workspace`
    const baseSlug = (user.email?.split('@')[0] || user.id.slice(0, 8))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
    const slug = `${baseSlug}-${user.id.slice(0, 8)}`

    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: workspaceName,
        slug,
        workspace_type: 'personal',
        max_projects: 2,
        max_guest_collaborators_per_project: 5,
        created_by_user_id: user.id,
      })
      .select()
      .single()

    if (orgError) throw orgError

    const { data: adminRole, error: roleError } = await supabaseAdmin
      .from('roles')
      .insert({
        organization_id: org.id,
        name: 'Org Admin',
        permissions: ORG_ADMIN_PERMISSIONS,
        is_system_role: true,
      })
      .select()
      .single()

    if (roleError) throw roleError

    let contactId = profile?.contact_id
    if (!contactId && user.email) {
      const { data: contact } = await supabaseAdmin
        .from('contacts')
        .insert({
          name: fullName,
          email: user.email.toLowerCase(),
          type: 'Team',
          role: 'Owner',
          organization_id: org.id,
          status: 'Available',
        })
        .select('id')
        .single()
      contactId = contact?.id
    }

    const { error: profileUpsertError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: user.id,
        organization_id: org.id,
        role_id: adminRole.id,
        contact_id: contactId,
        account_intent: 'workspace_owner',
        role: 'Admin',
      }, { onConflict: 'id' })

    if (profileUpsertError) throw profileUpsertError

    return new Response(
      JSON.stringify({ success: true, organization: org }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('provision-personal-workspace:', error)
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
