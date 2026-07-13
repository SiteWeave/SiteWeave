import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createGuestShare } from '../_shared/guestShare.ts'
import { createServiceClient, requireUser, assertOrgMember, roleHasPermission } from '../_shared/auth.ts'

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
  if (authResult instanceof Response) {
    return authResult
  }
  const { user } = authResult

  let body: {
    project_id?: string
    organization_id?: string
    task_ids?: string[]
    source?: string
  }
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
  const taskIds = Array.isArray(body.task_ids) ? body.task_ids.map(String).filter(Boolean) : []
  const source = (body.source === 'task_start' || body.source === 'dependency_unlocked')
    ? body.source
    : 'manual_reminder'

  if (!projectId || !organizationId || !taskIds.length) {
    return new Response(JSON.stringify({ error: 'project_id, organization_id, and task_ids required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const supabase = createServiceClient()

  const member = await assertOrgMember(supabase, user.id, organizationId, corsHeaders)
  if (member instanceof Response) return member
  if (!roleHasPermission(member.profile, 'can_assign_tasks')) {
    return new Response(JSON.stringify({ error: 'Missing can_assign_tasks permission' }), {
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

  const { data: tasks, error: tasksErr } = await supabase
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
    .in('id', taskIds)

  if (tasksErr) {
    return new Response(JSON.stringify({ error: tasksErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const found = new Set((tasks || []).map((t) => String(t.id)))
  const validIds = taskIds.filter((id) => found.has(id))
  if (!validIds.length) {
    return new Response(JSON.stringify({ error: 'No valid tasks for project' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const share = await createGuestShare(supabase, {
    projectId,
    organizationId,
    taskIds: validIds,
    source,
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
