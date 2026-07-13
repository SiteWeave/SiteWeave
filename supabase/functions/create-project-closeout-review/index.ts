import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createCloseoutReviewShare } from '../_shared/guestCloseoutShare.ts'
import { createServiceClient, requireUser, assertOrgMember } from '../_shared/auth.ts'
import { assertCanExportProfessionalDocs, EXPORT_FEATURE_LOCKED_ERROR } from '../_shared/workspaceTier.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const authResult = await requireUser(req, corsHeaders)
  if (authResult instanceof Response) return authResult
  const { user } = authResult

  let body: { project_id?: string; organization_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const projectId = String(body.project_id || '').trim()
  const organizationId = String(body.organization_id || '').trim()
  if (!projectId || !organizationId) {
    return new Response(JSON.stringify({ error: 'project_id and organization_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const supabase = createServiceClient()
  const member = await assertOrgMember(supabase, user.id, organizationId, corsHeaders)
  if (member instanceof Response) return member

  const tier = await assertCanExportProfessionalDocs(supabase, organizationId)
  if (!tier.ok) {
    return new Response(JSON.stringify({ error: EXPORT_FEATURE_LOCKED_ERROR }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('id, organization_id')
    .eq('id', projectId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (projectErr || !project) {
    return new Response(JSON.stringify({ error: 'Project not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const share = await createCloseoutReviewShare(supabase, {
    projectId,
    organizationId,
    createdByUserId: user.id,
  })

  if ('error' in share) {
    return new Response(JSON.stringify({ error: share.error }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  return new Response(JSON.stringify({ url: share.url, rawToken: share.rawToken }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
})
