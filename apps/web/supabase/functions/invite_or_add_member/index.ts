// Supabase Edge Function: invite_or_add_member
// Input: { projectId: string, entries: [{ email: string, role: string }] }
// Behavior:
// - If user exists: ensure contact by email, link via project_contacts (idempotent)
// - If user doesn't exist: upsert contact, link via project_contacts, and invite via auth.admin

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizeAssigneePhone } from '../_shared/phone.ts'
import { sendSms } from '../_shared/signalHouseSms.ts'
import { gateOrSendOptInForSubstantiveSms } from '../_shared/smsConsent.ts'
import { withTransactionalSmsFooter } from '../_shared/smsCompliance.ts'
import { isSmsNotificationsEnabled } from '../_shared/smsNotifications.ts'
import { createProjectAccessInvite, mapRoleToAccessLevel } from '../_shared/projectInvite.ts'
import { assertCanInviteGuestCollaborator, GUEST_COLLABORATOR_LIMIT_ERROR } from '../_shared/workspaceTier.ts'
import { corsHeadersFor, corsPreflightResponse } from '../_shared/cors.ts'
import {
  assertCanManageProject,
  createServiceClient,
  jsonResponse,
  requireUser,
} from '../_shared/auth.ts'
import { resolveProjectCrewRoleForInvite } from '../_shared/projectCrewRole.ts'
import { buildAddedToProjectEmail, getResendFrom } from '../_shared/transactionalEmailLayout.ts'

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

async function buildBlockedInviteEmails(
  supabase: ReturnType<typeof createClient>,
  inviter: { id: string; email?: string | null },
  projectId: string,
): Promise<Set<string>> {
  const blocked = new Set<string>()
  const inviterEmail = normalizeEmail(inviter.email || '')
  if (inviterEmail) blocked.add(inviterEmail)

  const { data: projectRow } = await supabase
    .from('projects')
    .select('created_by_user_id, project_manager_id')
    .eq('id', projectId)
    .maybeSingle()

  const ownerUserIds = [
    projectRow?.created_by_user_id,
    projectRow?.project_manager_id,
  ].filter((id): id is string => Boolean(id))

  if (ownerUserIds.length === 0) return blocked

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, contact_id')
    .in('id', ownerUserIds)

  const contactIds = (profiles || [])
    .map((p) => p.contact_id)
    .filter((id): id is string => Boolean(id))

  if (contactIds.length === 0) return blocked

  const { data: contacts } = await supabase
    .from('contacts')
    .select('email')
    .in('id', contactIds)

  for (const c of contacts || []) {
    const e = normalizeEmail(c.email || '')
    if (e) blocked.add(e)
  }

  return blocked
}

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
    const { user } = authResult

    const body = await req.json()
    console.log('Received request body:', JSON.stringify(body))
    
    const { projectId, entries } = body
    const addedByUserId = user.id

    if (!projectId || !Array.isArray(entries) || entries.length === 0) {
      console.error('Invalid payload:', { projectId, entries })
      return jsonResponse(
        { error: 'Invalid payload', details: { projectId, entriesCount: entries?.length } },
        400,
        corsHeaders,
      )
    }

    const authz = await assertCanManageProject(supabaseAdmin, user.id, projectId, corsHeaders)
    if (authz instanceof Response) return authz
    const organizationId = authz.organizationId
    
    console.log('Processing entries for project:', projectId)
    console.log('Project organization_id:', organizationId)

    const { data: orgRowForSms } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .maybeSingle()
    const organizationNameForSms = orgRowForSms?.name || 'Your team'

    const blockedEmails = await buildBlockedInviteEmails(supabaseAdmin, user, projectId)

    const results: Array<{ email: string; action: 'added' | 'invited' | 'skipped'; reason?: string }> = []
    const emailsToSend: Array<{ from: string; to: string[]; subject: string; html: string; text: string; reply_to?: string; tags?: Array<{ name: string; value: string }> }> = []
    const smsToSend: Array<{ email: string; phone: string; message: string }> = []

    for (const entry of entries as Entry[]) {
      const email = normalizeEmail(entry.email || '')
      const role = await resolveProjectCrewRoleForInvite(
        supabaseAdmin,
        organizationId,
        email,
        entry.role,
      )
      console.log('Processing entry:', { email, role })
      
      if (!email.includes('@')) {
        console.log('Invalid email format:', email)
        results.push({ email, action: 'skipped', reason: 'invalid_email' })
        continue
      }

      if (blockedEmails.has(email)) {
        console.log('Skipping blocked self/owner invite:', email)
        results.push({ email, action: 'skipped', reason: 'self_or_owner' })
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

        const perInviteCap = await assertCanInviteGuestCollaborator(supabaseAdmin, organizationId, projectId)
        if (!perInviteCap.ok) {
          results.push({ email, action: 'skipped', reason: GUEST_COLLABORATOR_LIMIT_ERROR })
          continue
        }

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
            const template = buildAddedToProjectEmail({
              inviterName,
              projectName,
              organizationName,
              projectInviteUrl,
              inviteShortCode,
            })

            emailsToSend.push({
              from: getResendFrom(),
              to: [email],
              subject: template.subject,
              html: template.html,
              text: template.text,
              reply_to: user.email ?? undefined,
              tags: [{ name: 'category', value: 'transactional' }],
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
    if (smsToSend.length > 0 && isSmsNotificationsEnabled()) {
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
        const smsResult = await sendSms({
          to: sms.phone,
          body: withTransactionalSmsFooter(sms.message),
        })
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


