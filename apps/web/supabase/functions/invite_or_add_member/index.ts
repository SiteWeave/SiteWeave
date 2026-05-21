// Supabase Edge Function: invite_or_add_member
// Input: { projectId: string, entries: [{ email: string, role: string }] }
// Behavior:
// - If user exists: ensure contact by email, link via project_contacts (idempotent)
// - If user doesn't exist: upsert contact, link via project_contacts, and invite via auth.admin

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizeAssigneePhone } from '../_shared/phone.ts'
import { sendTwilioSms } from '../_shared/twilioSms.ts'
import { gateOrSendOptInForSubstantiveSms } from '../_shared/smsConsent.ts'
import { createProjectAccessInvite, mapRoleToAccessLevel } from '../_shared/projectInvite.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
}

const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false }
})

type Entry = { email: string; role?: string }

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function mapContactType(role?: string): string {
  const r = (role || '').toLowerCase()
  if (r === 'client') return 'Client'
  if (r === 'subcontractor') return 'Subcontractor'
  if (r === 'pm' || r === 'project manager') return 'Team'
  return 'Team'
}

// CORS headers helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
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
    const body = await req.json()
    console.log('Received request body:', JSON.stringify(body))
    
    const { projectId, entries, addedByUserId } = body

    if (!projectId || !Array.isArray(entries) || entries.length === 0) {
      console.error('Invalid payload:', { projectId, entries })
      return new Response(
        JSON.stringify({ error: 'Invalid payload', details: { projectId, entriesCount: entries?.length } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('Processing entries for project:', projectId)

    // Get the project's organization_id (required for project_contacts)
    const { data: projectData, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .single()

    if (projectError || !projectData?.organization_id) {
      console.error('Error fetching project or missing organization_id:', projectError)
      return new Response(
        JSON.stringify({ error: 'Project not found or missing organization', details: projectError }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const organizationId = projectData.organization_id
    console.log('Project organization_id:', organizationId)

    const { data: orgRowForSms } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .maybeSingle()
    const organizationNameForSms = orgRowForSms?.name || 'Your team'

    const results: Array<{ email: string; action: 'added' | 'invited' | 'skipped'; reason?: string }> = []
    const emailsToSend: Array<{ from: string; to: string[]; subject: string; html: string }> = []
    const smsToSend: Array<{ email: string; phone: string; message: string }> = []

    for (const entry of entries as Entry[]) {
      const email = normalizeEmail(entry.email || '')
      const role = entry.role || 'Team'
      console.log('Processing entry:', { email, role })
      
      if (!email.includes('@')) {
        console.log('Invalid email format:', email)
        results.push({ email, action: 'skipped', reason: 'invalid_email' })
        continue
      }

      try {
        // For demo: Skip user existence check and just add contacts to project
        // In production, you can add invitation logic here
        console.log('Processing contact for email:', email)

        // Ensure a contact exists for this email
        // First, look for a contact in THIS organization
        console.log('Checking for existing contact with email in organization:', email, organizationId)
        let contactId: string | undefined = undefined
        let contactPhone: string | null = null
        
        // Try to find contact in the same organization first
        const { data: orgContact, error: orgContactError } = await supabaseAdmin
          .from('contacts')
          .select('id, phone')
          .ilike('email', email)
          .eq('organization_id', organizationId)
          .maybeSingle()

        if (orgContactError) {
          console.warn('Error looking up contact in org:', orgContactError)
        } else if (orgContact) {
          contactId = orgContact.id
          contactPhone = orgContact.phone || null
          console.log('Found contact in organization:', contactId)
        }

        // If not found in org, look for any contact with this email
        if (!contactId) {
          const { data: anyContacts, error: anyContactError } = await supabaseAdmin
            .from('contacts')
            .select('id, organization_id, phone')
            .ilike('email', email)
            .limit(1)

          if (anyContactError) {
            console.error('Error looking up any contact:', anyContactError)
            results.push({ email, action: 'skipped', reason: `contact_lookup_failed: ${anyContactError.message}` })
            continue
          }
          
          if (anyContacts && anyContacts.length > 0) {
            contactId = anyContacts[0].id
            contactPhone = anyContacts[0].phone || null
            console.log('Found contact (different org or null org):', contactId, 'org:', anyContacts[0].organization_id)
            
            // Update contact's organization_id if it's null
            if (!anyContacts[0].organization_id) {
              console.log('Updating contact organization_id to:', organizationId)
              const { error: updateOrgError } = await supabaseAdmin
                .from('contacts')
                .update({ organization_id: organizationId })
                .eq('id', contactId)
              
              if (updateOrgError) {
                console.warn('Failed to update contact org:', updateOrgError)
              }
            }
          }
        }
        
        console.log('Final contact ID after lookup:', contactId)

        if (!contactId) {
          console.log('Creating new contact for:', email)
          const contactData = {
            name: email,
            email,
            type: mapContactType(role),
            role: role,
            status: 'Available',
            created_by_user_id: addedByUserId || null,
            organization_id: organizationId
          }
          console.log('Contact data to insert:', contactData)
          
          const { data: newContact, error: contactError } = await supabaseAdmin
            .from('contacts')
            .insert(contactData)
            .select('id, phone')
            .single()

          if (contactError) {
            console.error('Error creating contact:', contactError)
            console.error('Contact error details:', {
              message: contactError.message,
              details: contactError.details,
              hint: contactError.hint,
              code: contactError.code
            })
            results.push({ 
              email, 
              action: 'skipped', 
              reason: `contact_create_failed: ${contactError.message}` 
            })
            continue
          }
          contactId = newContact.id
          contactPhone = newContact.phone || null
          console.log('Created new contact with ID:', contactId)
        }

        // Link to project via project_contacts (idempotent)
        console.log('Linking contact to project:', { projectId, contactId, role, organizationId })
        const { error: pcError } = await supabaseAdmin
          .from('project_contacts')
          .insert({ project_id: projectId, contact_id: contactId, role, organization_id: organizationId })

        if (pcError) {
          console.error('Error linking to project:', pcError)
          console.error('Project link error details:', {
            message: pcError.message,
            details: pcError.details,
            hint: pcError.hint,
            code: pcError.code
          })
          if (!pcError.message?.toLowerCase().includes('duplicate')) {
            results.push({ 
              email, 
              action: 'skipped', 
              reason: `project_link_failed: ${pcError.message}` 
            })
            continue
          } else {
            console.log('Contact already linked to project (duplicate key)')
          }
        }

        // Successfully added contact to project
        console.log('Successfully added contact to project')

        const inviteResult = await createProjectAccessInvite(supabaseAdmin, {
          projectId,
          organizationId,
          contactId: contactId || null,
          invitedEmail: email,
          accessLevel: mapRoleToAccessLevel(role),
          invitedByUserId: addedByUserId || null,
        })
        const inviteUrl = 'inviteUrl' in inviteResult ? inviteResult.inviteUrl : ''
        const inviteShortCode = 'shortCode' in inviteResult ? inviteResult.shortCode : ''
        if ('error' in inviteResult) {
          console.warn('project_access_invite create failed:', inviteResult.error)
        }
        
        // Fetch project and organization details for email
        const { data: project } = await supabaseAdmin
          .from('projects')
          .select('name, organization_id')
          .eq('id', projectId)
          .single()

        const projectName = project?.name || 'a project'
        
        // Get organization name
        let organizationName = 'an organization'
        if (project?.organization_id) {
          const { data: organization } = await supabaseAdmin
            .from('organizations')
            .select('name')
            .eq('id', project.organization_id)
            .maybeSingle()
          
          if (organization?.name) {
            organizationName = organization.name
          }
        }
        
        // Get inviter name
        let inviterName = 'A team member'
        if (addedByUserId) {
          const { data: inviterProfile } = await supabaseAdmin
            .from('profiles')
            .select(`
              contacts!fk_profiles_contact (
                name
              )
            `)
            .eq('id', addedByUserId)
            .maybeSingle()
          
          inviterName = inviterProfile?.contacts?.name || inviterName
        }

        // Get client name (optional) - check if project has a client contact
        let clientName: string | null = null
        const { data: clientContacts } = await supabaseAdmin
          .from('project_contacts')
          .select(`
            contacts!fk_project_contacts_contact (
              name,
              type
            )
          `)
          .eq('project_id', projectId)
          .limit(10)
        
        if (clientContacts && clientContacts.length > 0) {
          const client = clientContacts.find((pc: any) => pc.contacts?.type === 'Client')
          if (client?.contacts?.name) {
            clientName = client.contacts.name
          }
        }

        // Construct dashboard URL
        const baseUrl = (Deno.env.get('APP_URL') || 
                         Deno.env.get('VITE_APP_URL') || 
                         'https://app.siteweave.org').replace(/\/+$/, '')
        const dashboardUrl = `${baseUrl}/projects/${projectId}`
        const projectInviteUrl = inviteUrl || dashboardUrl

        const normalizedPhone = normalizeAssigneePhone(contactPhone || '')
        if (normalizedPhone.isValid && normalizedPhone.e164) {
          const codePart = inviteShortCode ? ` Code: ${inviteShortCode}.` : ''
          const smsMessage = `${inviterName} added you to ${projectName} on SiteWeave. Open: ${projectInviteUrl}${codePart}`
          smsToSend.push({
            email,
            phone: normalizedPhone.e164,
            message: smsMessage,
          })
        } else if (contactPhone) {
          console.log('Skipping SMS due to invalid phone format', { email, contactPhone })
        }
        
        // Prepare notification email (will be sent in batch later)
        if (RESEND_API_KEY) {
          try {
            console.log('Preparing notification email for:', email)
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
            padding: 32px 40px 24px 40px; 
            text-align: center; 
        }
        .logo-img {
            height: 120px;
            width: auto;
            margin: 0 auto;
            display: block;
        }
        .content { 
            padding: 32px 40px 40px 40px; 
        }
        .headline { 
            font-size: 24px; 
            font-weight: 600; 
            color: #1a1a1a; 
            margin: 0 0 24px 0;
            line-height: 1.3;
        }
        .job-details {
            background: #f3f4f6;
            border-radius: 4px;
            padding: 20px;
            margin: 24px 0;
        }
        .detail-row {
            display: flex;
            margin-bottom: 12px;
        }
        .detail-row:last-child {
            margin-bottom: 0;
        }
        .detail-label {
            font-size: 13px;
            color: #6b7280;
            font-weight: 500;
            min-width: 100px;
            flex-shrink: 0;
        }
        .detail-value {
            font-size: 15px;
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
            background: #2563EB; 
            color: #ffffff !important; 
            text-decoration: none; 
            border-radius: 6px; 
            font-weight: 600; 
            font-size: 15px; 
            letter-spacing: -0.2px;
            transition: background-color 0.2s;
        }
        .cta-button:hover {
            background: #1d4ed8;
            color: #ffffff !important;
        }
        .footer { 
            background: #f9fafb; 
            padding: 24px 40px; 
            text-align: center; 
            border-top: 1px solid #e5e7eb;
        }
        .footer-text {
            font-size: 12px; 
            color: #6b7280; 
            line-height: 1.6;
            margin: 0;
        }
        @media only screen and (max-width: 600px) {
            body { padding: 20px 12px; }
            .header { padding: 24px 24px 0 24px; }
            .content { padding: 24px 24px 32px 24px; }
            .footer { padding: 20px 24px; }
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
                <h2 class="headline">${inviterName} added you to ${projectName}.</h2>
                
                <div class="job-details">
                    <div class="detail-row">
                        <span class="detail-label">Project</span>
                        <span class="detail-value">${projectName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Your Role</span>
                        <span class="detail-value">${role}</span>
                    </div>
                    ${clientName ? `
                    <div class="detail-row">
                        <span class="detail-label">Client</span>
                        <span class="detail-value">${clientName}</span>
                    </div>
                    ` : ''}
                </div>
                
                <div class="cta-container">
                    <a href="${projectInviteUrl}" class="cta-button">Accept project invite</a>
                </div>
                ${inviteShortCode ? `<p style="text-align:center;font-size:13px;color:#6b7280;margin-top:12px;">Or sign in and enter code: <strong>${inviteShortCode}</strong></p>` : ''}
            </div>
            <div class="footer">
                <p class="footer-text">
                    You received this email because you are a member of ${organizationName}.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
            `.trim()

            // Add to batch email queue
            emailsToSend.push({
              from: 'SiteWeave <noreply@siteweave.org>',
              to: [email],
              subject: `${inviterName} added you to ${projectName}`,
              html: emailHtml
            })
            
            console.log('Email prepared for batch sending to:', email)
            results.push({ email, action: 'added', inviteUrl: projectInviteUrl, shortCode: inviteShortCode })
          } catch (emailError) {
            console.error('Error preparing email:', emailError)
            results.push({ email, action: 'added', reason: 'email_prep_failed', inviteUrl: projectInviteUrl, shortCode: inviteShortCode })
          }
        } else {
          console.log('RESEND_API_KEY not configured, skipping email')
          results.push({ email, action: 'added', reason: 'email_not_configured', inviteUrl: projectInviteUrl, shortCode: inviteShortCode })
        }
      } catch (entryError) {
        console.error('Error processing entry:', entryError)
        console.error('Entry error details:', {
          name: entryError.name,
          message: entryError.message,
          stack: entryError.stack
        })
        results.push({ 
          email, 
          action: 'skipped', 
          reason: `processing_error: ${entryError.message}` 
        })
      }
    }

    // Send all emails in a single batch request
    if (RESEND_API_KEY && emailsToSend.length > 0) {
      try {
        console.log(`Sending ${emailsToSend.length} emails in batch`)
        const batchResponse = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(emailsToSend)
        })

        const batchData = await batchResponse.json()

        if (batchResponse.ok) {
          console.log('Batch emails sent successfully:', batchData)
        } else {
          console.error('Batch email error:', {
            status: batchResponse.status,
            statusText: batchResponse.statusText,
            data: batchData
          })
          // Mark failed batch emails in results
          emailsToSend.forEach((emailPayload) => {
            const resultIndex = results.findIndex(r => r.email === emailPayload.to[0])
            if (resultIndex !== -1 && results[resultIndex].action === 'added') {
              results[resultIndex].reason = 'batch_email_failed'
            }
          })
        }
      } catch (batchError) {
        console.error('Error sending batch emails:', batchError)
      }
    }

    // Send SMS notifications one-by-one to preserve per-recipient status handling.
    if (smsToSend.length > 0) {
      for (const sms of smsToSend) {
        const gate = await gateOrSendOptInForSubstantiveSms(supabaseAdmin, {
          phoneE164: sms.phone,
          organizationId,
          organizationName: organizationNameForSms,
        })
        if (!gate.allowed) {
          if (gate.optInSent) {
            console.log('SMS substantive skipped; opt-in sent', { phone: sms.phone, email: sms.email })
          } else {
            console.log('SMS substantive skipped', { phone: sms.phone, reason: gate.reason })
          }
          const resultIndex = results.findIndex((r) => r.email === sms.email)
          if (resultIndex !== -1 && results[resultIndex].action === 'added' && !results[resultIndex].reason) {
            results[resultIndex].reason = gate.optInSent
              ? 'sms_opt_in_sent'
              : `sms_blocked:${gate.reason || 'consent'}`
          }
          continue
        }
        const smsResult = await sendTwilioSms({ to: sms.phone, body: sms.message })
        if (!smsResult.success) {
          console.error('Twilio SMS failed:', { email: sms.email, phone: sms.phone, error: smsResult.error })
          const resultIndex = results.findIndex((r) => r.email === sms.email)
          if (resultIndex !== -1 && results[resultIndex].action === 'added' && !results[resultIndex].reason) {
            results[resultIndex].reason = `sms_failed:${smsResult.error || 'unknown'}`
          }
        }
      }
    }

    console.log('Completed processing. Results:', JSON.stringify(results))
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('invite_or_add_member top-level error:', error)
    console.error('Error name:', error.name)
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)
    return new Response(JSON.stringify({ 
      error: 'internal_error',
      message: error.message,
      name: error.name
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})


