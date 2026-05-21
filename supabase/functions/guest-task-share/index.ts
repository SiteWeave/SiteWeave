import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sha256Hex } from '../_shared/guestShare.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const BUCKET = 'task_photos'
const SIGNED_TTL = 3600
const MAX_UPLOAD = 5242880

function parseBearer(req: Request): string | null {
  const h = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!h?.startsWith('Bearer ')) return null
  const t = h.slice(7).trim()
  return t || null
}

function sanitizeFileName(name: string): string {
  return String(name || 'photo.jpg')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'photo.jpg'
}

function guestPhotoPaths(
  orgId: string,
  projectId: string,
  taskId: string,
  photoId: string,
  fileName: string,
) {
  const safe = sanitizeFileName(fileName)
  const ext = safe.includes('.') ? safe.split('.').pop() : 'jpg'
  const baseName = `${photoId}-${Date.now()}`
  return {
    originalPath: `${orgId}/${projectId}/${taskId}/original/${baseName}.${ext}`,
  }
}

async function loadShare(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  rawToken: string,
) {
  const token_hash = await sha256Hex(rawToken)
  const { data, error } = await supabase
    .from('task_notification_guest_shares')
    .select('id, project_id, organization_id, task_ids, expires_at')
    .eq('token_hash', token_hash)
    .maybeSingle()

  if (error || !data) return null
  if (new Date(data.expires_at).getTime() <= Date.now()) return null
  return data
}

async function attachSignedUrls(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  photos: any[],
) {
  const out = []
  for (const p of photos || []) {
    const bucket = p.storage_bucket || BUCKET
    const [full, thumb] = await Promise.all([
      supabase.storage.from(bucket).createSignedUrl(p.storage_path, SIGNED_TTL),
      supabase.storage.from(bucket).createSignedUrl(p.thumbnail_path || p.storage_path, SIGNED_TTL),
    ])
    out.push({
      id: p.id,
      task_id: p.task_id,
      caption: p.caption,
      sort_order: p.sort_order,
      is_completion_photo: p.is_completion_photo,
      full_url: full.data?.signedUrl || null,
      thumbnail_url: thumb.data?.signedUrl || null,
    })
  }
  return out
}

const TASK_SELECT_GUEST =
  'id, text, start_date, due_date, completed, parent_task_id, is_milestone, created_at'

function truncateLabel(s: string, max = 80): string {
  const t = String(s || '').trim() || 'Task'
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

function dedupeDeps(rows: { task_id: string; successor_task_id: string }[]) {
  const seen = new Set<string>()
  const out: typeof rows = []
  for (const r of rows) {
    const k = `${r.task_id}|${r.successor_task_id}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const rawToken = parseBearer(req)
  if (!rawToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  const supabase = createClient(supabaseUrl, serviceKey)

  const share = await loadShare(supabase, rawToken)
  if (!share) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const taskIds: string[] = (share.task_ids || []) as string[]

  if (req.method === 'GET') {
    const { data: project, error: pErr } = await supabase
      .from('projects')
      .select('id, name, address')
      .eq('id', share.project_id)
      .maybeSingle()

    if (pErr || !project) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const sharedSet = new Set(taskIds)

    const { data: allRows, error: tErr } = await supabase
      .from('tasks')
      .select(TASK_SELECT_GUEST)
      .eq('project_id', share.project_id)

    if (tErr) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const allTasks = (allRows || []) as Record<string, unknown>[]
    const taskMap = new Map<string, Record<string, unknown>>(
      allTasks.map((t) => [String(t.id), t]),
    )
    const projectTaskIds = new Set(allTasks.map((t) => String(t.id)))

    const sharedOrdered = taskIds.map((id) => taskMap.get(id)).filter(Boolean) as Record<
      string,
      unknown
    >[]
    const sharedIdSet = new Set(sharedOrdered.map((t) => String(t.id)))
    const rest = allTasks
      .filter((t) => !sharedIdSet.has(String(t.id)))
      .sort((a, b) => {
        const ca = String(a.created_at || '')
        const cb = String(b.created_at || '')
        if (ca !== cb) return ca < cb ? -1 : ca > cb ? 1 : 0
        return String(a.text || '').localeCompare(String(b.text || ''))
      })
    const mergedOrder = [...sharedOrdered, ...rest]

    let photoRows: any[] = []
    if (taskIds.length) {
      const { data: pr } = await supabase
        .from('task_photos')
        .select('*')
        .in('task_id', taskIds)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      photoRows = pr || []
    }

    const photosByTask = new Map<string, any[]>()
    for (const row of photoRows || []) {
      const tid = row.task_id as string
      if (!photosByTask.has(tid)) photosByTask.set(tid, [])
      photosByTask.get(tid)!.push(row)
    }

    const tasksOut = await Promise.all(
      mergedOrder.map(async (t) => {
        const id = String(t.id)
        const interactive = sharedSet.has(id)
        const photos = interactive
          ? await attachSignedUrls(supabase, photosByTask.get(id) || [])
          : []
        return {
          id,
          text: t.text,
          start_date: t.start_date,
          due_date: t.due_date,
          completed: t.completed,
          parent_task_id: t.parent_task_id,
          is_milestone: t.is_milestone,
          created_at: t.created_at,
          guest_interactive: interactive,
          photos,
        }
      }),
    )

    const idList = [...projectTaskIds]
    let depRows: { task_id: string; successor_task_id: string; dependency_type: string; lag_days: number }[] = []
    if (idList.length) {
      const [{ data: d1 }, { data: d2 }] = await Promise.all([
        supabase
          .from('task_dependencies')
          .select('task_id, successor_task_id, dependency_type, lag_days')
          .in('task_id', idList),
        supabase
          .from('task_dependencies')
          .select('task_id, successor_task_id, dependency_type, lag_days')
          .in('successor_task_id', idList),
      ])
      depRows = dedupeDeps([...(d1 || []), ...(d2 || [])] as typeof depRows)
    }
    const taskDependencies = depRows
      .filter((r) => projectTaskIds.has(r.task_id) && projectTaskIds.has(r.successor_task_id))
      .map((r) => {
        const pred = taskMap.get(r.task_id)
        const succ = taskMap.get(r.successor_task_id)
        return {
          task_id: r.task_id,
          successor_task_id: r.successor_task_id,
          dependency_type: r.dependency_type,
          lag_days: r.lag_days,
          predecessor_summary: truncateLabel(String(pred?.text || 'Task')),
          successor_summary: truncateLabel(String(succ?.text || 'Task')),
        }
      })

    const { data: weatherRows } = await supabase
      .from('weather_impacts')
      .select(
        'id, impact_type, title, description, start_date, end_date, days_lost, affected_task_ids, affected_phase_ids, schedule_shift_applied, applied_at, created_at',
      )
      .eq('project_id', share.project_id)
      .order('created_at', { ascending: false })

    const MAX_AFFECTED_LABELS = 24
    const weather_impacts = (weatherRows || []).map((w: Record<string, unknown>) => {
      const rawIds = (w.affected_task_ids as string[] | null) || []
      const labels: { id: string; text: string }[] = []
      for (const tid of rawIds) {
        if (!tid || labels.length >= MAX_AFFECTED_LABELS) break
        const row = taskMap.get(String(tid))
        if (row) labels.push({ id: String(tid), text: truncateLabel(String(row.text || 'Task')) })
      }
      return {
        id: w.id,
        impact_type: w.impact_type,
        title: w.title,
        description: w.description,
        start_date: w.start_date,
        end_date: w.end_date,
        days_lost: w.days_lost,
        affected_task_ids: rawIds,
        affected_phase_ids: w.affected_phase_ids,
        schedule_shift_applied: w.schedule_shift_applied,
        applied_at: w.applied_at,
        created_at: w.created_at,
        affected_task_labels: labels,
      }
    })

    const { data: issueRows, error: issueErr } = await supabase
      .from('project_issues')
      .select('id, title, description, status, due_date, resolved_at, created_at, updated_at, current_step_id')
      .eq('project_id', share.project_id)
      .order('created_at', { ascending: false })

    const field_issues = issueErr ? [] : issueRows || []

    return new Response(
      JSON.stringify({
        project,
        tasks: tasksOut,
        weather_impacts,
        task_dependencies: taskDependencies,
        field_issues,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    )
  }

  if (req.method === 'POST') {
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const taskId = String(form.get('task_id') || '').trim()
    const file = form.get('file')
    if (!taskId || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'task_id and file required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    if (!taskIds.includes(taskId)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    const mt = file.type || 'application/octet-stream'
    if (!allowed.includes(mt)) {
      return new Response(JSON.stringify({ error: 'Unsupported file type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    if (file.size > MAX_UPLOAD) {
      return new Response(JSON.stringify({ error: 'File too large' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { data: taskCheck, error: taskErr } = await supabase
      .from('tasks')
      .select('id, project_id, organization_id')
      .eq('id', taskId)
      .eq('project_id', share.project_id)
      .maybeSingle()

    if (taskErr || !taskCheck) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const photoId = crypto.randomUUID()
    const { originalPath } = guestPhotoPaths(
      share.organization_id,
      share.project_id,
      taskId,
      photoId,
      file.name || 'photo.jpg',
    )

    const buf = new Uint8Array(await file.arrayBuffer())
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(originalPath, buf, {
      contentType: mt,
      upsert: false,
    })
    if (upErr) {
      return new Response(JSON.stringify({ error: 'Upload failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { data: maxRow } = await supabase
      .from('task_photos')
      .select('sort_order')
      .eq('task_id', taskId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    const sortOrder = (maxRow?.sort_order ?? -1) + 1

    const { data: inserted, error: insErr } = await supabase
      .from('task_photos')
      .insert({
        id: photoId,
        task_id: taskId,
        storage_bucket: BUCKET,
        storage_path: originalPath,
        thumbnail_path: null,
        caption: null,
        sort_order: sortOrder,
        is_completion_photo: false,
        uploaded_by_user_id: null,
        mime_type: mt,
        original_filename: file.name || null,
        file_size_bytes: file.size,
      })
      .select('*')
      .single()

    if (insErr || !inserted) {
      await supabase.storage.from(BUCKET).remove([originalPath])
      return new Response(JSON.stringify({ error: 'Save failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const [withUrls] = await attachSignedUrls(supabase, [inserted])
    return new Response(JSON.stringify({ photo: withUrls }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders })
})
