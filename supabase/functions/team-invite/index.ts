import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { resolveMemberRoleId } from '../_shared/ensureDefaultRoles.ts'

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
        // Use metadata for personalized greeting
        const firstName = metadata?.first_name || email.split('@')[0]
        const greeting = metadata?.first_name ? `Hi ${metadata.first_name},` : 'Hi there,'
        
        const emailSubject = `Join ${organizationName} on SiteWeave`
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
            line-height: 1.6; 
            color: #1a1a1a; 
            background: #f6f9fc; 
            padding: 40px 20px; 
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        .email-wrapper { 
            max-width: 600px; 
            margin: 0 auto; 
        }
        .card { 
            background: #ffffff; 
            border-radius: 8px; 
            border: 1px solid #e6ebf1;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            overflow: hidden;
        }
        .header { 
            background: #ffffff; 
            padding: 48px 40px 40px 40px; 
            text-align: center; 
            border-bottom: 1px solid #e5e7eb;
        }
        .logo-img {
            height: 120px;
            width: auto;
            margin: 0 auto 32px auto;
            display: block;
        }
        .content { 
            padding: 40px; 
        }
        .headline { 
            font-size: 24px; 
            font-weight: 600; 
            color: #1a1a1a; 
            margin: 0 0 16px 0;
            line-height: 1.3;
        }
        .greeting {
            font-size: 18px;
            font-weight: 500;
            color: #1a1a1a;
            margin: 0 0 16px 0;
        }
        .body-text { 
            font-size: 16px; 
            color: #4b5563; 
            margin: 0 0 24px 0;
            line-height: 1.6;
        }
        .body-text strong {
            color: #1a1a1a;
            font-weight: 600;
        }
        .cta-container {
            text-align: center;
            margin: 32px 0;
        }
        .cta-button { 
            display: inline-block; 
            padding: 12px 24px; 
            background: #1a1a1a; 
            color: #ffffff !important; 
            text-decoration: none; 
            border-radius: 6px; 
            font-weight: 500; 
            font-size: 15px; 
            letter-spacing: -0.2px;
            transition: background-color 0.2s;
        }
        .cta-button:hover {
            background: #2d2d2d;
            color: #ffffff !important;
        }
        .link-fallback {
            margin-top: 24px;
            padding-top: 24px;
            border-top: 1px solid #e5e7eb;
        }
        .link-fallback-text {
            font-size: 13px;
            color: #6b7280;
            margin: 0 0 8px 0;
        }
        .link-url {
            font-size: 13px;
            color: #2563EB;
            word-break: break-all;
            text-decoration: underline;
            display: inline-block;
            max-width: 100%;
        }
        .link-url:hover {
            color: #1d4ed8;
        }
        .expiry-notice {
            font-size: 13px;
            color: #6b7280;
            margin: 24px 0 0 0;
            text-align: center;
        }
        .footer { 
            background: #f9fafb; 
            padding: 32px 40px; 
            text-align: center; 
            border-top: 1px solid #e5e7eb;
        }
        .footer-text {
            font-size: 12px; 
            color: #6b7280; 
            line-height: 1.6;
            margin: 0 0 8px 0;
        }
        .footer-text:last-child {
            margin: 0;
        }
        .footer-compliance {
            font-size: 11px;
            color: #9ca3af;
            line-height: 1.5;
            margin: 16px 0 0 0;
            padding-top: 16px;
            border-top: 1px solid #e5e7eb;
        }
        .footer-compliance p {
            margin: 0 0 4px 0;
        }
        .footer-compliance p:last-child {
            margin: 0;
        }
        .footer-link {
            color: #4b5563;
            text-decoration: none;
        }
        .footer-link:hover {
            text-decoration: underline;
        }
        @media only screen and (max-width: 600px) {
            body { padding: 20px 12px; }
            .header { padding: 32px 24px 24px 24px; }
            .content { padding: 32px 24px; }
            .footer { padding: 24px; }
            .headline { font-size: 20px; }
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="card">
            <div class="header">
                <img src="https://app.siteweave.org/logo.svg" alt="SiteWeave" class="logo-img" />
            </div>
            <div class="content">
                <h2 class="headline">Join ${organizationName} on SiteWeave</h2>
                <p class="greeting">${greeting}</p>
                <p class="body-text"><strong>${inviterName}</strong> has invited you to collaborate with <strong>${organizationName}</strong> on SiteWeave.</p>
                <p class="body-text">Click the button below to accept your invitation and get started:</p>
                <div class="cta-container">
                    <a href="${setupUrl}" class="cta-button">Accept Invitation</a>
                </div>
                <div class="link-fallback">
                    <p class="link-fallback-text">Button not working? Copy and paste this link into your browser:</p>
                    <a href="${setupUrl}" class="link-url">${setupUrl}</a>
                </div>
                <p class="expiry-notice">This invitation will expire in 7 days.</p>
            </div>
            <div class="footer">
                <p class="footer-text">
                    <a href="https://siteweave.org" class="footer-link">siteweave.org</a>
                </p>
                <div class="footer-compliance">
                    <p>© 2026 SiteWeave. All rights reserved.</p>
                    <p>2965 Hero Way Ste 100 Leander, TX 78641</p>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
        `.trim()

        const emailText = `
Join ${organizationName} on SiteWeave

${inviterName} has invited you to collaborate with ${organizationName} on SiteWeave.

Accept your invitation by clicking this link:
${setupUrl}

This invitation will expire in 7 days.

---
© 2026 SiteWeave. All rights reserved.
SiteWeave, Inc. | 123 Business Street, Suite 100, City, State 12345
siteweave.org
        `.trim()

        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'SiteWeave Invitations <invitations@siteweave.org>',
            to: [email.toLowerCase()],
            subject: emailSubject,
            html: emailHtml,
            text: emailText
          })
        })

        const resendData = await resendResponse.json()
        console.log('Resend API response status:', resendResponse.status)
        console.log('Resend API response data:', JSON.stringify(resendData))

        if (!resendResponse.ok) {
          console.error('Resend error:', resendData)
          emailError = resendData.message || resendData.error?.message || 'Failed to send email'
        } else {
          emailSent = true
          console.log('Invitation email sent successfully to:', email, 'Email ID:', resendData.id)
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
