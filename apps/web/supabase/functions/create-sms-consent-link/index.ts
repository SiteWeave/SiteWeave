import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { normalizeAssigneePhone } from '../_shared/phone.ts'
import {
  assertOrgMember,
  createServiceClient,
  jsonResponse,
  requireUser,
  roleHasPermission,
} from '../_shared/auth.ts'
import { corsHeadersFor, corsPreflightResponse } from '../_shared/cors.ts'
import { fetchSmsConsent } from '../_shared/smsConsent.ts'
import {
  SMS_CONSENT_LINK_TTL_MS,
  buildSmsConsentPageUrl,
  generateConsentToken,
} from '../_shared/smsWebConsent.ts'

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)

  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const authResult = await requireUser(req, corsHeaders)
    if (authResult instanceof Response) return authResult
    const { user } = authResult

    const body = await req.json()
    const organizationId = String(body?.organizationId || '').trim()
    const rawPhone = String(body?.recipientPhone || body?.phone || '').trim()
    const contactId = body?.contactId ? String(body.contactId) : null
    const pmAttestation = body?.pmAttestation === true

    if (!organizationId) {
      return jsonResponse({ error: 'organizationId is required' }, 400, corsHeaders)
    }
    if (!pmAttestation) {
      return jsonResponse({ error: 'pmAttestation is required' }, 400, corsHeaders)
    }

    const normalized = normalizeAssigneePhone(rawPhone, 'US')
    if (!normalized.isValid || !normalized.e164) {
      return jsonResponse({ error: 'Invalid phone number' }, 400, corsHeaders)
    }

    const supabase = createServiceClient()
    const member = await assertOrgMember(supabase, user.id, organizationId, corsHeaders)
    if (member instanceof Response) return member
    const { profile } = member

    const canManage =
      profile.is_super_admin ||
      roleHasPermission(profile, 'can_manage_team') ||
      roleHasPermission(profile, 'can_edit_projects') ||
      roleHasPermission(profile, 'can_manage_projects')

    if (!canManage) {
      return jsonResponse({ error: 'Not allowed to create SMS consent links' }, 403, corsHeaders)
    }

    if (contactId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, organization_id, phone')
        .eq('id', contactId)
        .maybeSingle()
      if (!contact || contact.organization_id !== organizationId) {
        return jsonResponse({ error: 'Contact not found in organization' }, 404, corsHeaders)
      }
      const contactPhone = normalizeAssigneePhone(String(contact.phone || ''), 'US')
      if (!contactPhone.isValid || contactPhone.e164 !== normalized.e164) {
        return jsonResponse({ error: 'Phone does not match contact on file' }, 400, corsHeaders)
      }
    }

    const existingConsent = await fetchSmsConsent(supabase, normalized.e164)
    if (existingConsent?.status === 'opted_out') {
      return jsonResponse({ sent: false, reason: 'opted_out' }, 200, corsHeaders)
    }
    if (existingConsent?.status === 'confirmed') {
      return jsonResponse({
        sent: false,
        reason: 'already_confirmed',
        url: null,
      }, 200, corsHeaders)
    }

    const now = Date.now()
    const expiresAt = new Date(now + SMS_CONSENT_LINK_TTL_MS).toISOString()

    await supabase
      .from('sms_consent_requests')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('phone_e164', normalized.e164)
      .eq('organization_id', organizationId)
      .eq('status', 'pending')

    const token = generateConsentToken()
    const { error: insertErr } = await supabase.from('sms_consent_requests').insert({
      token,
      phone_e164: normalized.e164,
      organization_id: organizationId,
      contact_id: contactId,
      created_by: user.id,
      status: 'pending',
      expires_at: expiresAt,
    })

    if (insertErr) {
      console.error('create-sms-consent-link insert:', insertErr.message)
      return jsonResponse({ error: insertErr.message }, 500, corsHeaders)
    }

    const nowIso = new Date().toISOString()
    if (existingConsent?.status !== 'confirmed' && existingConsent?.status !== 'opted_out') {
      const { error: pendingErr } = await supabase.from('sms_phone_consent').upsert(
        {
          phone_e164: normalized.e164,
          status: 'pending',
          pending_organization_id: organizationId,
          updated_at: nowIso,
        },
        { onConflict: 'phone_e164' },
      )
      if (pendingErr) {
        console.error('create-sms-consent-link pending upsert:', pendingErr.message)
      }
    }

    const url = buildSmsConsentPageUrl(token)
    return jsonResponse({
      sent: true,
      token,
      url,
      expiresAt,
      phoneE164: normalized.e164,
    }, 200, corsHeaders)
  } catch (e) {
    console.error('create-sms-consent-link:', e)
    return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders)
  }
})
