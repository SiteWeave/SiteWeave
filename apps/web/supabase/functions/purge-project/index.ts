/**
 * Permanently purge a trashed project and its storage assets.
 * Auth: user JWT with trash permission, or service role for cron batch purge.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function throwOnError(error: { message: string } | null, step: string) {
  if (error) throw new Error(`${step}: ${error.message}`)
}

async function collectTaskPhotoPaths(
  supabaseAdmin: ReturnType<typeof createClient>,
  projectIds: string[],
): Promise<{ bucket: string; paths: string[] }[]> {
  const buckets = new Map<string, Set<string>>()

  const { data: tasks, error: tasksErr } = await supabaseAdmin
    .from('tasks')
    .select('id')
    .in('project_id', projectIds)
  throwOnError(tasksErr, 'select tasks')

  const taskIds = (tasks || []).map((t) => t.id)
  if (!taskIds.length) return []

  const { data: photos, error: photosErr } = await supabaseAdmin
    .from('task_photos')
    .select('storage_bucket, storage_path, thumbnail_path')
    .in('task_id', taskIds)
  throwOnError(photosErr, 'select task_photos')

  for (const photo of photos || []) {
    const bucket = (photo.storage_bucket as string) || 'task_photos'
    if (!buckets.has(bucket)) buckets.set(bucket, new Set())
    const set = buckets.get(bucket)!
    if (photo.storage_path) set.add(String(photo.storage_path))
    if (photo.thumbnail_path) set.add(String(photo.thumbnail_path))
  }

  return [...buckets.entries()].map(([bucket, paths]) => ({
    bucket,
    paths: [...paths],
  }))
}

async function removeStoragePaths(
  supabaseAdmin: ReturnType<typeof createClient>,
  groups: { bucket: string; paths: string[] }[],
) {
  for (const group of groups) {
    if (!group.paths.length) continue
    const { error } = await supabaseAdmin.storage.from(group.bucket).remove(group.paths)
    if (error) {
      console.warn(`purge-project: storage remove failed for ${group.bucket}`, error.message)
    }
  }
}

async function deleteProjectsByIds(
  supabaseAdmin: ReturnType<typeof createClient>,
  projectIds: string[],
) {
  if (!projectIds.length) return

  const { data: tasks, error: tasksSelectErr } = await supabaseAdmin
    .from('tasks')
    .select('id')
    .in('project_id', projectIds)
  throwOnError(tasksSelectErr, 'select tasks for projects')

  const taskIds = (tasks || []).map((t) => t.id)
  if (taskIds.length) {
    throwOnError(
      (await supabaseAdmin.from('task_photos').delete().in('task_id', taskIds)).error,
      'task_photos',
    )
    throwOnError(
      (await supabaseAdmin.from('task_dependencies').delete().in('task_id', taskIds)).error,
      'task_dependencies task_id',
    )
    throwOnError(
      (await supabaseAdmin.from('task_dependencies').delete().in('successor_task_id', taskIds)).error,
      'task_dependencies successor',
    )
    throwOnError(
      (await supabaseAdmin.from('task_comments').delete().in('task_id', taskIds)).error,
      'task_comments',
    )
  }

  throwOnError(
    (await supabaseAdmin.from('tasks').delete().in('project_id', projectIds)).error,
    'tasks',
  )
  throwOnError(
    (await supabaseAdmin.from('calendar_events').delete().in('project_id', projectIds)).error,
    'calendar_events',
  )
  throwOnError(
    (await supabaseAdmin.from('weather_impacts').delete().in('project_id', projectIds)).error,
    'weather_impacts',
  )
  throwOnError(
    (await supabaseAdmin.from('project_contacts').delete().in('project_id', projectIds)).error,
    'project_contacts',
  )
  throwOnError(
    (await supabaseAdmin.from('project_collaborators').delete().in('project_id', projectIds)).error,
    'project_collaborators',
  )
  throwOnError(
    (await supabaseAdmin.from('project_issues').delete().in('project_id', projectIds)).error,
    'project_issues',
  )
  throwOnError(
    (await supabaseAdmin.from('project_phases').delete().in('project_id', projectIds)).error,
    'project_phases',
  )
  throwOnError(
    (await supabaseAdmin.from('project_stream_posts').delete().in('project_id', projectIds)).error,
    'project_stream_posts',
  )
  throwOnError(
    (await supabaseAdmin.from('files').delete().in('project_id', projectIds)).error,
    'files',
  )

  const { data: channels, error: channelsErr } = await supabaseAdmin
    .from('message_channels')
    .select('id')
    .in('project_id', projectIds)
  throwOnError(channelsErr, 'select message_channels')

  const channelIds = (channels || []).map((c) => c.id)
  if (channelIds.length) {
    throwOnError(
      (await supabaseAdmin.from('messages').delete().in('channel_id', channelIds)).error,
      'messages',
    )
    throwOnError(
      (await supabaseAdmin.from('message_channels').delete().in('id', channelIds)).error,
      'message_channels',
    )
  }

  throwOnError(
    (await supabaseAdmin.from('projects').delete().in('id', projectIds)).error,
    'projects',
  )
}

async function purgeSingleProject(
  supabaseAdmin: ReturnType<typeof createClient>,
  projectId: string,
  actorUserId: string | null,
) {
  const { data: project, error: projectErr } = await supabaseAdmin
    .from('projects')
    .select('id, name, organization_id, trashed_at')
    .eq('id', projectId)
    .maybeSingle()
  throwOnError(projectErr, 'select project')

  if (!project) {
    throw new Error('Project not found')
  }
  if (!project.trashed_at) {
    throw new Error('Project must be in trash before permanent deletion')
  }

  const storageGroups = await collectTaskPhotoPaths(supabaseAdmin, [projectId])
  await removeStoragePaths(supabaseAdmin, storageGroups)
  await deleteProjectsByIds(supabaseAdmin, [projectId])

  await supabaseAdmin.from('project_lifecycle_events').insert({
    organization_id: project.organization_id,
    project_id: null,
    project_name: project.name,
    action: 'purged',
    actor_user_id: actorUserId,
    metadata: { project_id: projectId },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  const authHeader = req.headers.get('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const isServiceCall = serviceKey && token === serviceKey

  let body: { projectId?: string; confirmName?: string; expiredOnly?: boolean } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey)

  try {
    if (body.expiredOnly && isServiceCall) {
      const { data: expired, error: expiredErr } = await supabaseAdmin
        .from('projects')
        .select('id')
        .not('trashed_at', 'is', null)
        .lte('purge_after', new Date().toISOString())
      throwOnError(expiredErr, 'select expired trashed projects')

      const ids = (expired || []).map((row) => row.id)
      for (const id of ids) {
        await purgeSingleProject(supabaseAdmin, id, null)
      }

      return new Response(JSON.stringify({ success: true, purged: ids.length }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const projectId = body.projectId
    const confirmName = (body.confirmName || '').trim()
    if (!projectId) {
      return new Response(JSON.stringify({ error: 'projectId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser()
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { data: canTrash, error: canErr } = await supabaseUser.rpc('user_can_trash_project', {
      p_project_id: projectId,
    })
    if (canErr || !canTrash) {
      return new Response(JSON.stringify({ error: 'Not authorized to purge this project' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { data: project, error: projectErr } = await supabaseUser
      .from('projects')
      .select('id, name, trashed_at')
      .eq('id', projectId)
      .maybeSingle()
    throwOnError(projectErr, 'select project for purge')

    if (!project?.trashed_at) {
      return new Response(JSON.stringify({ error: 'Project must be in trash first' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    if (!confirmName || confirmName !== project.name) {
      return new Response(JSON.stringify({ error: 'Project name confirmation does not match' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    await purgeSingleProject(supabaseAdmin, projectId, userData.user.id)

    return new Response(JSON.stringify({ success: true, projectId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Purge failed'
    console.error('purge-project error', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
