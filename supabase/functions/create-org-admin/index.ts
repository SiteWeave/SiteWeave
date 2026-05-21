import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role key (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get request body
    const { orgName, orgSlug, adminEmail, adminPassword, adminName } = await req.json()

    if (!orgName || !orgSlug || !adminEmail || !adminPassword || !adminName) {
      throw new Error('Missing required fields: orgName, orgSlug, adminEmail, adminPassword, adminName')
    }

    console.log(`Creating organization: ${orgName} (${orgSlug}) for ${adminName} (${adminEmail})`)

    // 1. Create organization
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: orgName,
        slug: orgSlug,
        workspace_type: 'business',
        max_projects: null,
        created_by_user_id: null // Created by system
      })
      .select()
      .single()

    if (orgError) {
      console.error('Error creating organization:', orgError)
      throw orgError
    }

    console.log(`Organization created: ${org.id}`)

    // 2. Create default roles
    // "Org Admin" role with ALL permissions including can_manage_team
    const { data: adminRole, error: adminRoleError } = await supabaseAdmin
      .from('roles')
      .insert({
        organization_id: org.id,
        name: 'Org Admin',
        permissions: {
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
        },
        is_system_role: true
      })
      .select()
      .single()

    if (adminRoleError) {
      console.error('Error creating admin role:', adminRoleError)
      throw adminRoleError
    }

    console.log(`Admin role created: ${adminRole.id}`)

    // "Member" role with basic permissions
    const { data: memberRole, error: memberRoleError } = await supabaseAdmin
      .from('roles')
      .insert({
        organization_id: org.id,
        name: 'Member',
        permissions: {
          can_manage_team: false,
          can_manage_users: false,
          can_manage_roles: false,
          can_create_projects: false,
          can_edit_projects: false,
          can_delete_projects: false,
          can_assign_tasks: false,
          can_manage_contacts: false,
          can_create_tasks: false,
          can_edit_tasks: false,
          can_delete_tasks: false,
          can_send_messages: true
        },
        is_system_role: true
      })
      .select()
      .single()

    if (memberRoleError) {
      console.error('Error creating member role:', memberRoleError)
      throw memberRoleError
    }

    console.log(`Member role created: ${memberRole.id}`)

    // "Project Manager" role with project management permissions
    const { data: pmRole, error: pmRoleError } = await supabaseAdmin
      .from('roles')
      .insert({
        organization_id: org.id,
        name: 'Project Manager',
        permissions: {
          can_manage_team: false,
          can_manage_users: false,
          can_manage_roles: false,
          can_create_projects: true,
          can_edit_projects: true,
          can_delete_projects: false,
          can_assign_tasks: true,
          can_manage_contacts: true,
          can_create_tasks: true,
          can_edit_tasks: true,
          can_delete_tasks: true,
          can_send_messages: true,
          can_manage_progress_reports: true
        },
        is_system_role: true
      })
      .select()
      .single()

    if (pmRoleError) {
      console.error('Error creating project manager role:', pmRoleError)
      throw pmRoleError
    }

    console.log(`Project Manager role created: ${pmRole.id}`)

    // 3. Create auth user with password using Admin API
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail.toLowerCase(),
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: adminName
      }
    })

    if (authError) {
      console.error('Error creating auth user:', authError)
      throw authError
    }

    if (!authData?.user) {
      throw new Error('Failed to create auth user')
    }

    console.log(`Auth user created: ${authData.user.id}`)

    // 4. Create contact for admin
    const { data: contact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .insert({
        name: adminName,
        email: adminEmail.toLowerCase(),
        type: 'Team',
        role: 'Owner',
        organization_id: org.id,
        status: 'Available'
      })
      .select()
      .single()

    if (contactError) {
      console.error('Error creating contact:', contactError)
      // Continue - contact can be created later
    }

    console.log(`Contact created: ${contact?.id || 'skipped'}`)

    // 5. Create profile and link to organization with "Org Admin" role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: authData.user.id,
        organization_id: org.id,
        role_id: adminRole.id,
        contact_id: contact?.id || null
      }, {
        onConflict: 'id'
      })
      .select()
      .single()

    if (profileError) {
      console.error('Error creating/updating profile:', profileError)
      throw profileError
    }

    console.log(`Profile created/updated: ${profile.id}`)

    // Founding admin: attribute org ownership to the new admin (setup wizard + org metadata)
    const { error: orgOwnerError } = await supabaseAdmin
      .from('organizations')
      .update({ created_by_user_id: authData.user.id })
      .eq('id', org.id)

    if (orgOwnerError) {
      console.error('Error setting organization created_by_user_id:', orgOwnerError)
      throw orgOwnerError
    }

    return new Response(
      JSON.stringify({
        success: true,
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug
        },
        admin: {
          id: authData.user.id,
          email: adminEmail,
          name: adminName
        },
        roles: {
          adminRoleId: adminRole.id,
          memberRoleId: memberRole.id,
          pmRoleId: pmRole.id
        },
        message: `Organization "${orgName}" created successfully. Admin user ready to log in.`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error in create-org-admin function:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
