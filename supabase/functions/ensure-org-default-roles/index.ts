import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { ensureDefaultRoles, ensureOrgAdminRolePermissions } from '../_shared/ensureDefaultRoles.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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

    const { organizationId } = await req.json()
    if (!organizationId) {
      throw new Error('Missing organizationId')
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('organization_id, roles(permissions)')
      .eq('id', user.id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!profile) {
      throw new Error('Not a member of this organization')
    }

    const orgAdminRoleId = await ensureOrgAdminRolePermissions(supabaseAdmin, organizationId)
    const { memberRoleId, projectManagerRoleId } = await ensureDefaultRoles(
      supabaseAdmin,
      organizationId,
    )

    return new Response(
      JSON.stringify({
        success: true,
        orgAdminRoleId,
        memberRoleId,
        projectManagerRoleId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})
