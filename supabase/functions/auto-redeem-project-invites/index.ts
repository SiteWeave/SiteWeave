import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { normalizeInviteEmail } from '../_shared/projectInvite.ts'
import { corsHeaders, corsPreflightResponse } from '../_shared/cors.ts'

async function redeemInviteForUser(
  supabaseAdmin: ReturnType<typeof createClient>,
  user: { id: string; email?: string },
  invite: Record<string, unknown>,
) {
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
    .select('contact_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.contact_id && invite.contact_id) {
    await supabaseAdmin.from('profiles').upsert({
      id: user.id,
      contact_id: invite.contact_id,
      account_intent: 'guest_only',
      role: 'Team',
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

  return invite.project_id as string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt)
    if (authError || !user?.email) throw new Error('Unauthorized')

    const email = normalizeInviteEmail(user.email)
    const now = new Date().toISOString()

    const { data: pendingInvites, error: listError } = await supabaseAdmin
      .from('project_access_invites')
      .select('*')
      .eq('status', 'pending')
      .ilike('invited_email', email)
      .gt('expires_at', now)

    if (listError) throw listError

    const redeemed: string[] = []
    for (const invite of pendingInvites || []) {
      try {
        const projectId = await redeemInviteForUser(supabaseAdmin, user, invite)
        redeemed.push(projectId)
      } catch (e) {
        console.warn('auto-redeem skip invite', invite.id, e)
      }
    }

    return new Response(
      JSON.stringify({ success: true, redeemedProjectIds: redeemed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('auto-redeem-project-invites:', error)
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
