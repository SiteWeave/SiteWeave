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

    const { fullName, username, password, organizationId, roleId } = await req.json()

    if (!fullName || !username || !password || !organizationId) {
      throw new Error('Missing required fields: fullName, username, password, organizationId')
    }
    
    // Generate email from username if not provided (for managed accounts)
    const email = `${username}@siteweave.local`

    // Verify user has can_manage_team permission
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select(`
        role_id,
        roles (
          permissions
        )
      `)
      .eq('id', user.id)
      .eq('organization_id', organizationId)
      .single()

    if (!profile?.roles?.permissions?.can_manage_team) {
      throw new Error('Not authorized - can_manage_team permission required')
    }

    const resolvedRoleId = await resolveMemberRoleId(supabaseAdmin, organizationId, roleId)
    if (!resolvedRoleId) {
      throw new Error('No assignable role found for this organization.')
    }

    // Create auth user with username
    const { data: authData, error: authError2 } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        username: username
      }
    })

    if (authError2) throw authError2
    if (!authData?.user) throw new Error('Failed to create auth user')

    const normalizedEmail = email.toLowerCase()

    // Reuse existing org contact when present (avoid duplicate email + nulling contact_id on upsert)
    let contactId: string | null = null
    const { data: existingContact } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('email', normalizedEmail)
      .maybeSingle()

    if (existingContact?.id) {
      contactId = existingContact.id
    } else {
      const { data: contact, error: contactError } = await supabaseAdmin
        .from('contacts')
        .insert({
          name: fullName,
          email: normalizedEmail,
          type: 'Team',
          organization_id: organizationId
        })
        .select('id')
        .single()

      if (contactError) throw contactError
      contactId = contact?.id ?? null
    }

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('contact_id, review_eligible_at')
      .eq('id', authData.user.id)
      .maybeSingle()

    // Update profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: authData.user.id,
        organization_id: organizationId,
        role_id: resolvedRoleId,
        contact_id: contactId || existingProfile?.contact_id || null,
        must_change_password: true, // Managed accounts must change password on first login
        ...(!existingProfile?.review_eligible_at
          ? { review_eligible_at: new Date().toISOString() }
          : {}),
      }, {
        onConflict: 'id'
      })

    if (profileError) throw profileError

    return new Response(
      JSON.stringify({
        success: true,
        userId: authData.user.id,
        email: email.toLowerCase(),
        username: username
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
