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

    // Verify the request is from a super admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Check if user is super admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_super_admin) {
      throw new Error('Not authorized - super admin only')
    }

    // Get request body
    const { companyName, ownerName, ownerEmail } = await req.json()

    if (!companyName || !ownerName || !ownerEmail) {
      throw new Error('Missing required fields: companyName, ownerName, ownerEmail')
    }

    console.log(`Creating organization: ${companyName} for ${ownerName} (${ownerEmail})`)

    // 1. Create organization
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: companyName,
        slug: slug,
        workspace_type: 'business',
        max_projects: null,
        // Invited owner claims org on invite accept (see InviteAcceptPage); not the super admin
        created_by_user_id: null
      })
      .select()
      .single()

    if (orgError) {
      console.error('Error creating organization:', orgError)
      throw orgError
    }

    console.log(`Organization created: ${org.id}`)

    // 2. Create Org Admin role (same name and permissions as create-org-admin flow)
    const { data: adminRole, error: roleError } = await supabaseAdmin
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

    if (roleError) {
      console.error('Error creating admin role:', roleError)
      throw roleError
    }

    console.log(`Admin role created: ${adminRole.id}`)

    // 3. Create contact for owner
    const { data: ownerContact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .insert({
        name: ownerName,
        email: ownerEmail.toLowerCase(),
        type: 'Team',
        role: 'Owner',
        organization_id: org.id,
        status: 'Available'
      })
      .select()
      .single()

    if (contactError) {
      console.error('Error creating owner contact:', contactError)
      throw contactError
    }

    console.log(`Owner contact created: ${ownerContact.id}`)

    // 4. Create invitation
    const invitationToken = crypto.randomUUID().replace(/-/g, '')
    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from('invitations')
      .insert({
        email: ownerEmail.toLowerCase(),
        organization_id: org.id,
        role_id: adminRole.id,
        invited_by_user_id: user.id,
        invitation_token: invitationToken,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single()

    if (invitationError) {
      console.error('Error creating invitation:', invitationError)
      throw invitationError
    }

    console.log(`Invitation created: ${invitation.id}`)

    // 5. Generate setup link
    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'
    const setupUrl = `${appUrl}/invite/${invitationToken}`

    console.log(`Setup URL: ${setupUrl}`)

    // Optional: Send email here using Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (resendApiKey) {
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'SiteWeave <onboarding@yourdomain.com>',
            to: [ownerEmail],
            subject: `Welcome to SiteWeave - ${companyName}`,
            html: `
              <h2>Welcome to SiteWeave!</h2>
              <p>Your organization <strong>${companyName}</strong> has been created.</p>
              <p>Click the link below to set your password and get started:</p>
              <p><a href="${setupUrl}">${setupUrl}</a></p>
              <p>This link will expire in 7 days.</p>
              <br/>
              <p>Best regards,<br/>The SiteWeave Team</p>
            `
          })
        })

        if (emailResponse.ok) {
          console.log('Invitation email sent successfully')
        } else {
          console.error('Failed to send invitation email:', await emailResponse.text())
        }
      } catch (emailError) {
        console.error('Error sending email:', emailError)
        // Don't fail the whole request if email fails
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug
        },
        owner: {
          name: ownerName,
          email: ownerEmail
        },
        setupUrl: setupUrl,
        invitation: {
          id: invitation.id,
          token: invitationToken,
          expiresAt: invitation.expires_at
        },
        message: `Organization "${companyName}" created successfully. Setup link: ${setupUrl}`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error in create-organization function:', error)
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
