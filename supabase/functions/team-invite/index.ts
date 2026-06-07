import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { resolveMemberRoleId } from '../_shared/ensureDefaultRoles.ts'
import { buildTeamInviteEmail, sendTransactionalEmail } from '../_shared/transactionalEmailLayout.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const { email, organizationId, roleId, metadata } = await req.json()

    if (!email || !organizationId) {
      throw new Error('Missing required fields: email, organizationId')
    }

    // Verify user has can_manage_team permission
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(`
        role_id,
        organization_id,
        roles (
          permissions,
          name
        )
      `)
      .eq('id', user.id)
      .eq('organization_id', organizationId)
      .single()

    if (profileError) {
      console.error('Error fetching profile:', profileError)
      throw new Error(`Failed to verify permissions: ${profileError.message}`)
    }

    if (!profile) {
      throw new Error('User profile not found or not in this organization')
    }

    // Check if user has can_manage_team permission
    const hasPermission = profile?.roles?.permissions?.can_manage_team === true
    
    // Fallback: If user created the organization, allow them to manage team
    // (useful for initial setup when roles might not be configured yet)
    let isOrgCreator = false
    if (!hasPermission) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('created_by_user_id')
        .eq('id', organizationId)
        .single()
      
      isOrgCreator = org?.created_by_user_id === user.id
    }

    if (!hasPermission && !isOrgCreator) {
      console.error('Permission check failed:', {
        userId: user.id,
        organizationId,
        roleId: profile.role_id,
        roleName: profile.roles?.name,
        permissions: profile.roles?.permissions,
        hasPermission,
        isOrgCreator
      })
      throw new Error('Not authorized - can_manage_team permission required. Please ensure your role has the can_manage_team permission enabled.')
    }

    const resolvedRoleId = await resolveMemberRoleId(supabaseAdmin, organizationId, roleId)
    if (!resolvedRoleId) {
      throw new Error(
        'No assignable role found for this organization. Ensure default roles exist or specify a valid role.',
      )
    }

    // Generate invitation token
    const invitationToken = crypto.randomUUID().replace(/-/g, '')

    // Create invitation with metadata
    const invitationData: any = {
      email: email.toLowerCase(),
      organization_id: organizationId,
      role_id: resolvedRoleId,
      invited_by_user_id: user.id,
      invitation_token: invitationToken,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }
    
    // Add metadata if provided
    if (metadata && typeof metadata === 'object') {
      invitationData.metadata = metadata
    }

    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from('invitations')
      .insert(invitationData)
      .select()
      .single()

    if (invitationError) throw invitationError

    // Get organization and inviter details for email
    const { data: organization } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single()

    const { data: inviterProfile } = await supabaseAdmin
      .from('profiles')
      .select(`
        contacts!fk_profiles_contact (
          name
        )
      `)
      .eq('id', user.id)
      .single()

    const inviterName = inviterProfile?.contacts?.name || 'A team member'
    const organizationName = organization?.name || 'an organization'

    // Construct invitation URL
    // Priority: APP_URL env var > VITE_APP_URL > production fallback
    // Remove trailing slashes to prevent double slashes
    const baseUrl = (Deno.env.get('APP_URL') || 
                     Deno.env.get('VITE_APP_URL') || 
                     'https://app.siteweave.org').replace(/\/+$/, '')
    const setupUrl = `${baseUrl}/invite/${invitationToken}`

    // Send invitation email via Resend
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    let emailSent = false
    let emailError = null

    console.log('RESEND_API_KEY configured:', !!RESEND_API_KEY)
    console.log('Sending invitation email to:', email.toLowerCase())

    if (RESEND_API_KEY) {
      try {
        const greeting = metadata?.first_name ? `Hi ${metadata.first_name},` : 'Hi there,'
        const template = buildTeamInviteEmail({
          inviterName,
          organizationName,
          setupUrl,
          greeting,
        })

        const sendResult = await sendTransactionalEmail({
          to: email.toLowerCase(),
          subject: template.subject,
          html: template.html,
          text: template.text,
          replyTo: user.email ?? null,
        })

        if (!sendResult.success) {
          emailError = sendResult.error || 'Failed to send email'
        } else {
          emailSent = true
          console.log('Invitation email sent successfully to:', email, 'Email ID:', sendResult.id)
        }
      } catch (emailErr) {
        console.error('Error sending invitation email:', emailErr)
        emailError = emailErr.message || 'Failed to send email'
      }
    } else {
      console.log('RESEND_API_KEY not configured, skipping email send')
      emailError = 'Email service not configured'
    }

    return new Response(
      JSON.stringify({
        success: true,
        invitationId: invitation.id,
        setupUrl: setupUrl,
        emailSent: emailSent,
        emailError: emailError || null
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
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
