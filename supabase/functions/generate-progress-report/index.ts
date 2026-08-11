// Supabase Edge Function: Generate Progress Report
// Generates progress report data with audience-based filtering

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonStringifySafe } from '../_shared/jsonSafe.ts'
import { mergePmActionsNotes, pmActionsSectionEnabled } from '../_shared/pmActions.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TASK_PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7
const MAX_REPORT_PHOTOS_PER_TASK = 3

const MS_PER_DAY = 24 * 60 * 60 * 1000

function errorMessageFromUnknown(error: unknown): string {
  if (error instanceof Error) return error.message || String(error)
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message: unknown }).message
    if (typeof m === 'string' && m.length > 0) return m
  }
  try {
    return jsonStringifySafe(error)
  } catch {
    return 'Unexpected error during report generation'
  }
}

function dedupeTasksById<T extends { id?: string | null }>(tasks: T[]): T[] {
  if (!Array.isArray(tasks)) return tasks
  const seen = new Set<string>()
  const out: T[] = []
  for (const t of tasks) {
    const id = t?.id
    if (id == null) {
      out.push(t)
      continue
    }
    const key = String(id)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

function normalizeCalendarDateKey(value: string | null | undefined): string {
  if (value == null || value === '') return ''
  const s = String(value).trim()
  const ymd = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (ymd) return ymd[1]
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

/** Same title + phase + start date — duplicate DB rows (import/clone). */
function scheduledTaskDuplicateKey(t: {
  project_id?: string | null
  start_date?: string | null
  project_phase_id?: string | null
  text?: string | null
}): string {
  return [
    String(t?.project_id ?? ''),
    normalizeCalendarDateKey(t?.start_date ?? null),
    String(t?.project_phase_id ?? ''),
    String(t?.text ?? '').trim(),
  ].join('\u0001')
}

function dedupeWeeklyPlanRowsByDisplay(rows: any[]): any[] {
  const seen = new Set<string>()
  const out: any[] = []
  for (const r of rows) {
    const k = [
      String(r?.project_id ?? ''),
      String(r?.text ?? '').trim(),
      String(r?.phase_name ?? '').trim(),
      normalizeCalendarDateKey(r?.start_date),
    ].join('\u0001')
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

function dedupeLastWeekDoneRowsByDisplay(rows: any[]): any[] {
  const seen = new Set<string>()
  const out: any[] = []
  for (const r of rows) {
    const k = [
      String(r?.project_id ?? ''),
      String(r?.text ?? '').trim(),
      String(r?.phase_name ?? '').trim(),
      normalizeCalendarDateKey(r?.completed_at),
    ].join('\u0001')
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

function dedupeTasksByNamePhaseStartDate<
  T extends {
    project_id?: string | null
    start_date?: string | null
    project_phase_id?: string | null
    text?: string | null
  },
>(tasks: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const t of tasks) {
    const k = scheduledTaskDuplicateKey(t)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

function lastWeekDoneDisplayKey(t: {
  project_id?: string | null
  project_phase_id?: string | null
  text?: string | null
  completed_at?: string | null
  updated_at?: string | null
  created_at?: string | null
}): string {
  const source = t.completed_at || t.updated_at || t.created_at
  const day = normalizeCalendarDateKey(source ?? null)
  return [
    String(t?.project_id ?? ''),
    day,
    String(t?.project_phase_id ?? ''),
    String(t?.text ?? '').trim(),
  ].join('\u0001')
}

function dedupeTasksForLastWeekDone<T extends {
  project_id?: string | null
  project_phase_id?: string | null
  text?: string | null
  completed_at?: string | null
  updated_at?: string | null
  created_at?: string | null
}>(tasks: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const t of tasks) {
    const k = lastWeekDoneDisplayKey(t)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

function toUtcDateBound(dateString: string | null | undefined): Date | null {
  if (!dateString) return null
  const parsed = new Date(`${dateString}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function attachFallbackPhaseDatesForTimeline(phases: any[], projectDueDate: string | null | undefined): any[] {
  if (!Array.isArray(phases) || phases.length === 0) return []
  const hasAnyDate = phases.some((phase) => phase.start_date && phase.end_date)
  if (hasAnyDate) return phases

  const today = new Date()
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const due = toUtcDateBound(projectDueDate ?? null)
  const fallbackEnd =
    due && due > start ? due : new Date(start.getTime() + phases.length * MS_PER_DAY)
  const totalDays = Math.max(1, Math.floor((fallbackEnd.getTime() - start.getTime()) / MS_PER_DAY))

  return phases.map((phase, index) => {
    const rangeStartOffset = Math.floor((index * totalDays) / phases.length)
    const rangeEndOffset = Math.floor(((index + 1) * totalDays) / phases.length)
    const phaseStart = new Date(start.getTime() + rangeStartOffset * MS_PER_DAY)
    const phaseEnd = new Date(
      start.getTime() + Math.max(rangeStartOffset + 1, rangeEndOffset) * MS_PER_DAY,
    )
    return {
      ...phase,
      start_date: phase.start_date || phaseStart.toISOString().slice(0, 10),
      end_date: phase.end_date || phaseEnd.toISOString().slice(0, 10),
    }
  })
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function nthWeekdayOfMonthUtc(year: number, monthIndex: number, weekday: number, nth: number): Date {
  const first = new Date(Date.UTC(year, monthIndex, 1))
  const shift = (weekday - first.getUTCDay() + 7) % 7
  return new Date(Date.UTC(year, monthIndex, 1 + shift + (nth - 1) * 7))
}

function lastWeekdayOfMonthUtc(year: number, monthIndex: number, weekday: number): Date {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0))
  const shift = (last.getUTCDay() - weekday + 7) % 7
  return new Date(Date.UTC(year, monthIndex, last.getUTCDate() - shift))
}

function observedFixedHolidayUtc(year: number, monthIndex: number, day: number): Date {
  const d = new Date(Date.UTC(year, monthIndex, day))
  const dow = d.getUTCDay()
  if (dow === 6) return new Date(Date.UTC(year, monthIndex, day - 1))
  if (dow === 0) return new Date(Date.UTC(year, monthIndex, day + 1))
  return d
}

function usFederalHolidaySetForYear(year: number): Set<string> {
  const dates = [
    observedFixedHolidayUtc(year, 0, 1),
    nthWeekdayOfMonthUtc(year, 0, 1, 3),
    nthWeekdayOfMonthUtc(year, 1, 1, 3),
    lastWeekdayOfMonthUtc(year, 4, 1),
    observedFixedHolidayUtc(year, 5, 19),
    observedFixedHolidayUtc(year, 6, 4),
    nthWeekdayOfMonthUtc(year, 8, 1, 1),
    nthWeekdayOfMonthUtc(year, 9, 1, 2),
    observedFixedHolidayUtc(year, 10, 11),
    nthWeekdayOfMonthUtc(year, 10, 4, 4),
    observedFixedHolidayUtc(year, 11, 25),
  ]
  return new Set(dates.map(toIsoDate))
}

function buildFederalHolidayMap(startDate: Date, endDateExclusive: Date): Set<string> {
  const startYear = startDate.getUTCFullYear() - 1
  const endYear = endDateExclusive.getUTCFullYear() + 1
  const all = new Set<string>()
  for (let year = startYear; year <= endYear; year += 1) {
    for (const iso of usFederalHolidaySetForYear(year)) {
      all.add(iso)
    }
  }
  return all
}

function isBusinessDay(date: Date, holidayMap: Set<string>): boolean {
  const dow = date.getUTCDay()
  if (dow === 0 || dow === 6) return false
  return !holidayMap.has(toIsoDate(date))
}

function businessDaysBetween(startInclusive: Date, endExclusive: Date, holidayMap: Set<string>): number {
  if (!startInclusive || !endExclusive || endExclusive <= startInclusive) return 0
  let count = 0
  const d = new Date(startInclusive)
  while (d < endExclusive) {
    if (isBusinessDay(d, holidayMap)) count += 1
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return count
}

function scheduleTimelineFromBounds(
  minStart: Date,
  maxEnd: Date,
  now: Date,
): { schedule_day_current: number; schedule_day_total: number; schedule_progress_pct: number } {
  const endExclusive = new Date(maxEnd.getTime() + MS_PER_DAY)
  const holidayMap = buildFederalHolidayMap(minStart, endExclusive)
  const totalDays = Math.max(1, businessDaysBetween(minStart, endExclusive, holidayMap))
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  let elapsedDays = businessDaysBetween(minStart, today, holidayMap)
  elapsedDays = Math.max(0, Math.min(totalDays, elapsedDays))

  const schedule_progress_pct = Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)))

  return {
    schedule_day_current: elapsedDays,
    schedule_day_total: totalDays,
    schedule_progress_pct,
  }
}

function computeTaskEndDate(task: { due_date?: string | null; start_date?: string | null; duration_days?: number | null }): string | null {
  if (typeof task?.due_date === 'string' && task.due_date.length > 0) return task.due_date
  if (typeof task?.start_date !== 'string' || task.start_date.length === 0) return null
  const parsedStart = toUtcDateBound(task.start_date)
  if (!parsedStart) return null
  const durationRaw = Number(task.duration_days)
  const durationDays = Number.isFinite(durationRaw) ? Math.max(1, Math.trunc(durationRaw)) : 1
  const end = new Date(parsedStart.getTime() + (durationDays - 1) * MS_PER_DAY)
  return end.toISOString().slice(0, 10)
}

function inferScheduleBoundsFromTasks(
  tasks: { start_date?: string | null; due_date?: string | null; duration_days?: number | null }[],
  projectDueDate: string | null | undefined,
): { start: string; end: string } | null {
  if (!tasks || tasks.length === 0) return null
  const all: string[] = []
  for (const t of tasks) {
    if (t.start_date) all.push(t.start_date)
    if (t.due_date) all.push(t.due_date)
    const eff = computeTaskEndDate(t)
    if (eff) all.push(eff)
  }
  if (all.length === 0) return null
  all.sort()
  const inferredStart = all[0]
  const latestAmongTasks = all[all.length - 1]
  const inferredEnd =
    typeof projectDueDate === 'string' &&
    projectDueDate.length > 0 &&
    projectDueDate >= inferredStart
      ? projectDueDate
      : latestAmongTasks
  if (!inferredEnd || inferredEnd < inferredStart) return null
  return { start: inferredStart, end: inferredEnd }
}

/** Keep in sync with packages/core-logic `computeProjectScheduleTimeline` (projectProgressRollup.js). */
function computeProjectScheduleTimeline(
  phases: any[],
  projectDueDate: string | null | undefined,
  now: Date,
  projectStartDate?: string | null,
  tasks?: { start_date?: string | null; due_date?: string | null; duration_days?: number | null }[] | null,
): { schedule_day_current: number; schedule_day_total: number; schedule_progress_pct: number } | null {
  const windowStart = toUtcDateBound(projectStartDate ?? null)
  const windowEnd = toUtcDateBound(projectDueDate ?? null)
  if (windowStart && windowEnd && windowEnd >= windowStart) {
    return scheduleTimelineFromBounds(windowStart, windowEnd, now)
  }

  const inferred = inferScheduleBoundsFromTasks(tasks || [], projectDueDate)
  if (inferred) {
    const s = toUtcDateBound(inferred.start)
    const e = toUtcDateBound(inferred.end)
    if (s && e && e >= s) {
      return scheduleTimelineFromBounds(s, e, now)
    }
  }

  if (!phases || phases.length === 0) return null

  const sorted = [...phases].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const normalized = attachFallbackPhaseDatesForTimeline(sorted, projectDueDate)

  let minStart: Date | null = null
  let maxEnd: Date | null = null
  for (const p of normalized) {
    const s = toUtcDateBound(p.start_date)
    const e = toUtcDateBound(p.end_date)
    if (s && e) {
      if (!minStart || s < minStart) minStart = s
      if (!maxEnd || e > maxEnd) maxEnd = e
    }
  }
  if (!minStart || !maxEnd) return null

  return scheduleTimelineFromBounds(minStart, maxEnd, now)
}

function phaseNameForTask(projectPhaseId: string | null | undefined, phaseList: any[]): string | null {
  if (!projectPhaseId || !phaseList?.length) return null
  const ph = phaseList.find((p: any) => String(p.id) === String(projectPhaseId))
  return ph?.name != null ? String(ph.name) : null
}

/** Latest effective task end date (due_date fallback to start_date + duration_days - 1). */
function maxTaskDueDate(taskList: { due_date?: string | null; start_date?: string | null; duration_days?: number | null }[]): string | null {
  let max: string | null = null
  for (const t of taskList || []) {
    const d = computeTaskEndDate(t)
    if (typeof d === 'string' && d.length > 0 && (!max || d > max)) max = d
  }
  return max
}

function keepOriginalCompletionDateEnabled(sections: { keep_original_completion_date?: boolean } | null | undefined): boolean {
  return sections?.keep_original_completion_date !== false
}

function resolveReportProjectEndDate(
  project: { due_date?: string | null; client_due_date?: string | null } | null | undefined,
  taskList: { due_date?: string | null; start_date?: string | null; duration_days?: number | null }[],
  keepOriginal: boolean,
): string | null {
  if (keepOriginal && project?.client_due_date) return project.client_due_date
  return maxTaskDueDate(taskList) || project?.due_date || null
}

function resolveReportScheduleDueDate(
  project: { due_date?: string | null; client_due_date?: string | null } | null | undefined,
  keepOriginal: boolean,
): string | null {
  if (keepOriginal && project?.client_due_date) return project.client_due_date
  return project?.due_date ?? null
}

/** PostgREST `.in('project_id', uuid[])` query strings grow with org size; chunk to stay under URL/proxy limits. */
const ORG_PROJECT_IN_CHUNK_SIZE = 75

function chunkProjectIdsForInFilter(ids: string[]): string[][] {
  if (!ids.length) return []
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += ORG_PROJECT_IN_CHUNK_SIZE) {
    out.push(ids.slice(i, i + ORG_PROJECT_IN_CHUNK_SIZE))
  }
  return out
}

async function fetchInProjectIdChunks<T>(
  projectIds: string[],
  fetchChunk: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<{ data: T[]; error: any }> {
  if (!projectIds.length) return { data: [], error: null }
  const merged: T[] = []
  for (const chunk of chunkProjectIdsForInFilter(projectIds)) {
    const { data, error } = await fetchChunk(chunk)
    if (error) return { data: [], error }
    if (data?.length) merged.push(...data)
  }
  return { data: merged, error: null }
}

/** Email/export only need derived sections; full task/phase rows blow up JSON for org-wide reports. */
function slimReportPayloadForTransport<T extends Record<string, unknown>>(data: T): T {
  if (!data || typeof data !== 'object') return data
  const out = { ...data } as Record<string, unknown>
  delete out.all_tasks
  delete out.all_phases
  return out as T
}

async function fetchActivityLogForReport(opts: {
  supabase: ReturnType<typeof createClient>
  organizationId: string
  startDate: string
  endDate: string
  projectId: string | null | undefined
  effectiveProjectIds: string[]
}): Promise<{ data: any[]; error: any }> {
  const { supabase, organizationId, startDate, endDate, projectId, effectiveProjectIds } = opts

  if (projectId) {
    return await supabase
      .from('activity_log')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false })
  }

  const merged: any[] = []
  const seen = new Set<string>()

  const pushRows = (rows: any[] | null) => {
    for (const row of rows || []) {
      const id = row?.id
      if (id != null) {
        const key = String(id)
        if (seen.has(key)) continue
        seen.add(key)
      }
      merged.push(row)
    }
  }

  const { data: nullProjectRows, error: nullErr } = await supabase
    .from('activity_log')
    .select('*')
    .eq('organization_id', organizationId)
    .is('project_id', null)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false })

  if (nullErr) return { data: [], error: nullErr }
  pushRows(nullProjectRows)

  for (const chunk of chunkProjectIdsForInFilter(effectiveProjectIds)) {
    const { data: chunkRows, error: chunkErr } = await supabase
      .from('activity_log')
      .select('*')
      .eq('organization_id', organizationId)
      .in('project_id', chunk)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false })

    if (chunkErr) return { data: [], error: chunkErr }
    pushRows(chunkRows)
  }

  merged.sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  )

  return { data: merged, error: null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: corsHeaders
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Missing authorization header' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  // Server-to-server only. New Supabase service keys (sb_secret_*) are not user JWTs — the edge
  // gateway's verify_jwt must be false, and we authenticate here by comparing to the service role.
  if (!serviceKey || token !== serviceKey) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // Parse body
  let body: any = {}
  try {
    body = await req.json()
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }

  try {
    const { schedule_id } = body

    if (!schedule_id) {
      return new Response(
        JSON.stringify({ error: 'Missing schedule_id' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          } 
        }
      )
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    // Fetch schedule configuration
    const { data: schedule, error: scheduleError } = await supabase
      .from('progress_report_schedules')
      .select('*, progress_report_recipients(*)')
      .eq('id', schedule_id)
      .single()

    if (scheduleError || !schedule) {
      return new Response(
        JSON.stringify({ error: 'Schedule not found' }),
        { 
          status: 404, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          } 
        }
      )
    }

    // Time range: since last send, but never shorter than MIN_WINDOW (avoids empty reports after a recent send/export).
    const endMs = Date.now()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    const MIN_WINDOW_MS = sevenDaysMs
    let startMs = endMs - sevenDaysMs
    if (schedule.last_sent_at) {
      const parsed = new Date(schedule.last_sent_at).getTime()
      if (Number.isFinite(parsed)) startMs = parsed
    }
    if (endMs - startMs < MIN_WINDOW_MS) {
      startMs = endMs - MIN_WINDOW_MS
    }
    const startDate = new Date(startMs).toISOString()
    const endDate = new Date(endMs).toISOString()

    const includeTaskPhotos = shouldIncludeTaskPhotos(schedule)

    // Fetch organization and project info
    const { data: organization, error: organizationError } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', schedule.organization_id)
      .single()
    if (organizationError || !organization) {
      return new Response(
        JSON.stringify({ error: 'Failed to load organization for report generation' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    let project = null
    if (schedule.project_id) {
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('name, status, status_color, due_date, start_date, client_due_date')
        .eq('id', schedule.project_id)
        .single()
      if (projectError || !projectData) {
        return new Response(
          JSON.stringify({ error: 'Failed to load project for report generation' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        )
      }
      project = projectData
    }

    /** Org reports: projects in scope (subset or whole org). Single-project: one id. */
    let effectiveProjectIds: string[] = []
    let orgProjectsData: any[] = []

    if (!schedule.project_id) {
      const { data: projectsData, error: projectsErr } = await supabase
        .from('projects')
        .select('id, name, status, status_color, due_date, start_date, client_due_date')
        .eq('organization_id', schedule.organization_id)
      if (projectsErr) {
        return new Response(
          JSON.stringify({ error: 'Failed to load organization projects for report generation' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        )
      }
      orgProjectsData = projectsData || []
      const allIds = orgProjectsData.map((p: any) => String(p.id))
      const includedRaw = (schedule as any).included_project_ids as unknown
      const includedList = Array.isArray(includedRaw)
        ? includedRaw.map((id: unknown) => (id == null ? '' : String(id).trim())).filter(Boolean)
        : []
      // Treat null/undefined/empty the same as "all org projects" so legacy [] rows do not scope to zero tasks.
      const chosen =
        includedList.length > 0
          ? includedList.filter((id: string) => allIds.includes(id))
          : allIds
      // If every stored id was stale/invalid, fall back to whole org instead of an empty scope.
      effectiveProjectIds = chosen.length > 0 ? chosen : allIds
    } else {
      effectiveProjectIds = [schedule.project_id]
    }

    // Query activity_log: project-scoped, or org-scoped via NULL project_id + chunked project_id IN
    const { data: activitiesRaw, error: activitiesError } = await fetchActivityLogForReport({
      supabase,
      organizationId: schedule.organization_id,
      startDate,
      endDate,
      projectId: schedule.project_id,
      effectiveProjectIds,
    })
    if (activitiesError) {
      return new Response(
        JSON.stringify({ error: 'Failed to load activity log for report generation' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    const activities = activitiesRaw || []

    // Query current project state
    let tasks = []
    let phases = []

    if (schedule.project_id) {
      // Get tasks for this project
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*, contacts(name, email), task_photos(*)')
        .eq('project_id', schedule.project_id)
        .eq('organization_id', schedule.organization_id)
      if (tasksError) {
        return new Response(
          JSON.stringify({ error: 'Failed to load project tasks for report generation' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        )
      }

      tasks = dedupeTasksByNamePhaseStartDate(dedupeTasksById(tasksData || []))

      // Get phases for this project
      const { data: phasesData, error: phasesError } = await supabase
        .from('project_phases')
        .select('*')
        .eq('project_id', schedule.project_id)
        .eq('organization_id', schedule.organization_id)
        .order('order', { ascending: true })
      if (phasesError) {
        return new Response(
          JSON.stringify({ error: 'Failed to load project phases for report generation' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        )
      }

      phases = phasesData || []
    } else {
      if (effectiveProjectIds.length > 0) {
        const { data: tasksData, error: tasksError } = await fetchInProjectIdChunks(
          effectiveProjectIds,
          (chunk) =>
            supabase
              .from('tasks')
              // tasks→projects has duplicate FK constraints; bare `projects(...)` fails PostgREST embed resolution.
              .select('*, contacts(name, email), projects!fk_tasks_project_id(name), task_photos(*)')
              .in('project_id', chunk)
              .eq('organization_id', schedule.organization_id),
        )
        if (tasksError) {
          return new Response(
            JSON.stringify({ error: 'Failed to load organization tasks for report generation' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          )
        }

        tasks = dedupeTasksByNamePhaseStartDate(dedupeTasksById((tasksData || []) as any[]))

        const { data: phasesData, error: phasesError } = await fetchInProjectIdChunks(
          effectiveProjectIds,
          (chunk) =>
            supabase
              .from('project_phases')
              .select('*, projects!fk_project_phases_project_id(name)')
              .in('project_id', chunk)
              .eq('organization_id', schedule.organization_id)
              .order('order', { ascending: true }),
        )
        if (phasesError) {
          return new Response(
            JSON.stringify({ error: 'Failed to load organization phases for report generation' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          )
        }

        phases = (phasesData || []).slice().sort((a: any, b: any) => {
          const pa = String(a.project_id ?? '')
          const pb = String(b.project_id ?? '')
          if (pa !== pb) return pa.localeCompare(pb)
          return (Number(a.order) || 0) - (Number(b.order) || 0)
        })
      }
    }

    // Weather / schedule impacts logged in the reporting window
    let weatherImpacts: any[] = []
    if (schedule.project_id) {
      const { data: wiRows, error: weatherError } = await supabase
        .from('weather_impacts')
        .select('*')
        .eq('organization_id', schedule.organization_id)
        .eq('project_id', schedule.project_id)
        .order('created_at', { ascending: false })
      if (weatherError) {
        return new Response(
          JSON.stringify({ error: 'Failed to load project weather impacts for report generation' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        )
      }
      const filteredWeatherRows = (wiRows || []).filter((w: any) =>
        weatherImpactFallsInWindow(w, startDate, endDate),
      )
      weatherImpacts = mapWeatherImpactRows(filteredWeatherRows, project?.name || null)
    } else {
      let wiRows: any[] = []
      let weatherError: any = null
      if (effectiveProjectIds.length > 0) {
        const w = await fetchInProjectIdChunks(effectiveProjectIds, (chunk) =>
          supabase
            .from('weather_impacts')
            .select('*, projects!weather_impacts_project_id_fkey(name)')
            .eq('organization_id', schedule.organization_id)
            .in('project_id', chunk)
            .order('created_at', { ascending: false }),
        )
        wiRows = w.data
        weatherError = w.error
      }
      if (weatherError) {
        return new Response(
          JSON.stringify({ error: 'Failed to load organization weather impacts for report generation' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        )
      }
      wiRows.sort(
        (a: any, b: any) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      )
      const filteredWeatherRows = (wiRows || []).filter((w: any) =>
        weatherImpactFallsInWindow(w, startDate, endDate),
      )
      weatherImpacts = mapOrgWideWeatherImpactRows(filteredWeatherRows)
    }

    // Applied schedule pull-forwards (early completion) in the reporting window
    let scheduleAdjustments: any[] = []
    const includeScheduleAdjustments = schedule.report_sections?.show_schedule_adjustments === true
    if (includeScheduleAdjustments) {
      const mapAdj = (rows: any[], projectNameFallback: string | null = null) =>
        (rows || []).map((row: any) => ({
          id: row.id,
          project_id: row.project_id,
          project_name: row.projects?.name || projectNameFallback || null,
          source_task_id: row.source_task_id,
          note: row.note,
          applied_workdays: row.applied_workdays,
          planned_finish: row.planned_finish,
          actual_finish: row.actual_finish,
          applied_at: row.applied_at,
          created_at: row.created_at,
        }))

      const inWindow = (row: any) => {
        const ts = row.applied_at || row.created_at
        if (!ts) return false
        const d = new Date(ts)
        return d >= startDate && d <= endDate
      }

      if (schedule.project_id) {
        const { data: adjRows, error: adjError } = await supabase
          .from('schedule_adjustments')
          .select('*')
          .eq('organization_id', schedule.organization_id)
          .eq('project_id', schedule.project_id)
          .eq('status', 'applied')
          .order('applied_at', { ascending: false })
        if (adjError) {
          return new Response(
            JSON.stringify({ error: 'Failed to load schedule adjustments for report generation' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          )
        }
        scheduleAdjustments = mapAdj((adjRows || []).filter(inWindow), project?.name || null)
      } else if (effectiveProjectIds.length > 0) {
        const a = await fetchInProjectIdChunks(effectiveProjectIds, (chunk) =>
          supabase
            .from('schedule_adjustments')
            .select('*, projects!schedule_adjustments_project_id_fkey(name)')
            .eq('organization_id', schedule.organization_id)
            .eq('status', 'applied')
            .in('project_id', chunk)
            .order('applied_at', { ascending: false }),
        )
        if (a.error) {
          return new Response(
            JSON.stringify({ error: 'Failed to load organization schedule adjustments for report generation' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          )
        }
        scheduleAdjustments = mapAdj((a.data || []).filter(inWindow))
      }
    }

    // Daily site logs — only when the schedule opts in (optional section).
    let dailySiteLogs: any[] = []
    const includeDailySiteLogs = schedule.report_sections?.include_daily_site_logs === true
    const dailyLogProjectIds = schedule.project_id
      ? [schedule.project_id]
      : effectiveProjectIds
    if (includeDailySiteLogs && dailyLogProjectIds.length > 0) {
      let dlQuery = supabase
        .from('project_stream_posts')
        .select('id, project_id, title, body, payload, file_url, file_name, created_at, projects!project_stream_posts_project_id_fkey(name)')
        .eq('organization_id', schedule.organization_id)
        .eq('post_type', 'daily_log')
        .in('project_id', dailyLogProjectIds)
        .order('created_at', { ascending: true })
      if (startDate) {
        dlQuery = dlQuery.gte('created_at', startDate)
      }
      if (endDate) {
        dlQuery = dlQuery.lte('created_at', endDate)
      }
      const { data: dlRows, error: dlError } = await dlQuery
      if (dlError) {
        console.error('Failed to load daily site logs for report generation', dlError)
      } else {
        dailySiteLogs = (dlRows || []).map((row: any) => ({
          id: row.id,
          project_id: row.project_id,
          project_name: row.projects?.name || null,
          title: row.title,
          body: row.body,
          payload: row.payload,
          file_url: row.file_url || null,
          file_name: row.file_name || null,
          created_at: row.created_at,
        }))
      }
    }

    // PM Actions — include when as_of_date falls in the report window (and section enabled).
    let pmActionsMerged: Record<string, string> | null = null
    const pmActionProjectIds = schedule.project_id
      ? [schedule.project_id]
      : effectiveProjectIds
    let pmActionRows: any[] = []
    const includePmActions = pmActionsSectionEnabled(schedule.report_sections)
    if (includePmActions && pmActionProjectIds.length > 0) {
      let pmQuery = supabase
        .from('project_pm_actions')
        .select('*')
        .eq('organization_id', schedule.organization_id)
        .in('project_id', pmActionProjectIds)
        .order('as_of_date', { ascending: false })
      if (startDate) pmQuery = pmQuery.gte('as_of_date', String(startDate).slice(0, 10))
      if (endDate) pmQuery = pmQuery.lte('as_of_date', String(endDate).slice(0, 10))
      const { data: pmRows, error: pmError } = await pmQuery
      if (pmError) {
        console.error('Failed to load PM Actions for report generation', pmError)
      } else {
        pmActionRows = pmRows || []
        pmActionsMerged = mergePmActionsNotes(pmActionRows) as Record<string, string> | null
      }
    }

    // Process activities into structured changes
    const statusChanges = []
    const completedTasksById = new Map<string, {
      id: string
      text: string
      title: string
      completed_at: string
      assignee: unknown
      project_name: string
      phase_name: string | null
      task_photos: unknown[]
    }>()
    const phaseProgress = []

    activities?.forEach(activity => {
      const det = parseActivityDetails(activity)

      if (
        activity.entity_type === 'project' &&
        activity.action === 'updated' &&
        (det.status != null || det.new_status != null)
      ) {
        statusChanges.push({
          project_id: activity.project_id,
          project_name: activity.entity_name || project?.name || 'Project',
          old_status: det.old_status,
          new_status: det.new_status ?? det.status,
          changed_by: activity.user_name,
          changed_at: activity.created_at
        })
      }

      if (activity.entity_type === 'task' && activity.action === 'completed') {
        const task = tasks.find(t => t.id === activity.entity_id)
        if (task) {
          const prev = completedTasksById.get(task.id)
          const nextAt = new Date(activity.created_at).getTime()
          if (!prev || nextAt >= new Date(prev.completed_at).getTime()) {
            completedTasksById.set(task.id, {
              id: task.id,
              text: task.text,
              title: task.text,
              completed_at: activity.created_at,
              assignee: task.contacts?.name || task.assignee_id,
              project_name: task.projects?.name || project?.name,
              phase_name: phaseNameForTask((task as any).project_phase_id, phases),
              task_photos: task.task_photos || [],
            })
          }
        }
      }

      if (activity.entity_type === 'project_phase' && activity.action === 'updated') {
        const phase = phases.find(p => p.id === activity.entity_id)
        if (phase && det.old_progress !== undefined) {
          phaseProgress.push({
            id: phase.id,
            name: phase.name,
            old_progress: det.old_progress,
            progress: det.new_progress ?? phase.progress,
            project_name: phase.projects?.name || project?.name,
            is_client_visible: phase.is_client_visible,
          })
        }
      }
    })

    // Also include tasks completed in-window by completed_at (activity_log can miss some).
    const periodStartMs = startDate ? new Date(startDate).getTime() : NaN
    const periodEndMs = endDate ? new Date(endDate).getTime() : Date.now()
    for (const task of tasks) {
      if (!task?.completed || !task.id || completedTasksById.has(task.id)) continue
      const completedAtRaw = task.completed_at || task.updated_at
      if (!completedAtRaw) continue
      const completedMs = new Date(completedAtRaw).getTime()
      if (Number.isNaN(completedMs)) continue
      if (Number.isFinite(periodStartMs) && completedMs < periodStartMs) continue
      if (Number.isFinite(periodEndMs) && completedMs > periodEndMs) continue
      completedTasksById.set(task.id, {
        id: task.id,
        text: task.text,
        title: task.text,
        completed_at: completedAtRaw,
        assignee: task.contacts?.name || task.assignee_id,
        project_name: task.projects?.name || project?.name,
        phase_name: phaseNameForTask((task as any).project_phase_id, phases),
        task_photos: task.task_photos || [],
      })
    }

    const completedTasks = Array.from(completedTasksById.values())

    const visiblePhases = phases.filter((p: { is_client_visible?: boolean }) => p.is_client_visible !== false)
    const openTasks = tasks.filter((t: { completed?: boolean }) => !t.completed)
    const doneTasks = tasks.filter((t: { completed?: boolean }) => t.completed)
    const reportCompletedTasks = includeTaskPhotos
      ? await Promise.all(completedTasks.map(async (task: any) => ({
          ...task,
          photos: await buildTaskPhotoAssets(supabase, task.task_photos || [], MAX_REPORT_PHOTOS_PER_TASK),
          task_photos: undefined,
        })))
      : completedTasks.map((task: any) => ({ ...task, task_photos: undefined }))

    // ── Vitals (deterministic, no AI) ─────────────────────────────────────────
    // tasks_completed_count = all tasks marked done in the DB (same as snapshot.completed_total).
    // Period-only completions stay in `completed_tasks` for the "Completed this period" section.
    // Schedule timeline (day X of Y): project baseline start→due when both set; else phase calendar envelope only.
    const keepOriginalCompletionDate = keepOriginalCompletionDateEnabled(schedule.report_sections)
    const scheduleTimeline = schedule.project_id
      ? computeProjectScheduleTimeline(
          phases,
          resolveReportScheduleDueDate(project, keepOriginalCompletionDate),
          new Date(),
          project?.start_date ?? null,
          tasks,
        )
      : null
    const vitals = {
      tasks_completed_count: doneTasks.length,
      open_tasks_count: openTasks.length,
      project_end_date: resolveReportProjectEndDate(project, tasks, keepOriginalCompletionDate),
      ...(scheduleTimeline
        ? {
            schedule_day_current: scheduleTimeline.schedule_day_current,
            schedule_day_total: scheduleTimeline.schedule_day_total,
            schedule_progress_pct: scheduleTimeline.schedule_progress_pct,
          }
        : {}),
    }

    // ── Last / this / next week buckets (rolling 7-day windows) ──────────────
    // "This week" = open tasks whose schedule overlaps [today, today+7), including
    // in-progress work that started earlier. "Next week" = tasks that start in
    // [today+7, today+14) so continuing work is not listed twice.
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000
    const oneWeekAgo = new Date(today.getTime() - oneWeekMs)
    const thisWeekEnd = new Date(today.getTime() + oneWeekMs)
    const nextWeekEnd = new Date(today.getTime() + 2 * oneWeekMs)

    const taskStartDate = (value?: string) => {
      if (!value) return null
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return null
      d.setHours(0, 0, 0, 0)
      return d
    }

    const taskOverlapsWindow = (task: any, windowStart: Date, windowEnd: Date) => {
      const start = taskStartDate(task.start_date)
      if (!start) return false
      const end = taskStartDate(computeTaskEndDate(task) ?? undefined)
      if (!end) return false
      return start < windowEnd && end >= windowStart
    }

    const taskCompletedAt = (task: any): Date | null => {
      const source = task.completed_at || task.updated_at || task.created_at
      if (!source) return null
      const d = new Date(source)
      if (Number.isNaN(d.getTime())) return null
      return d
    }

    const periodCompletedIdSet = new Set(completedTasks.map((c: { id: string }) => c.id))
    const lastWeekDoneRows = dedupeLastWeekDoneRowsByDisplay(
      dedupeTasksForLastWeekDone(
        doneTasks.filter((t: any) => {
          if (periodCompletedIdSet.has(t.id)) return false
          const completedAt = taskCompletedAt(t)
          return completedAt != null && completedAt >= oneWeekAgo && completedAt < today
        }),
      )
        .sort((a: any, b: any) => {
          const aTime = taskCompletedAt(a)?.getTime() ?? 0
          const bTime = taskCompletedAt(b)?.getTime() ?? 0
          return bTime - aTime
        })
        .map((t: any) => ({
          id: t.id,
          text: t.text,
          project_id: t.project_id ?? null,
          project_name: (t.projects as any)?.name ?? project?.name ?? null,
          completed_at: t.completed_at || t.updated_at || t.created_at,
          assignee: (t.contacts as any)?.name ?? null,
          phase_name: phaseNameForTask(t.project_phase_id, phases),
          task_photos: t.task_photos || [],
        })),
    ).slice(0, 10)
    const lastWeekDone = includeTaskPhotos
      ? await Promise.all(
          lastWeekDoneRows.map(async (t: any) => ({
            ...t,
            photos: await buildTaskPhotoAssets(supabase, t.task_photos || [], MAX_REPORT_PHOTOS_PER_TASK),
            task_photos: undefined,
          })),
        )
      : lastWeekDoneRows.map((t: any) => ({ ...t, task_photos: undefined }))

    const thisWeekPlan = dedupeWeeklyPlanRowsByDisplay(
      openTasks
        .filter((t: any) => taskOverlapsWindow(t, today, thisWeekEnd))
        .sort((a: any, b: any) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
        .map((t: any) => ({
          text: t.text,
          start_date: t.start_date,
          project_id: t.project_id ?? null,
          project_name: (t.projects as any)?.name ?? project?.name ?? null,
          assignee: (t.contacts as any)?.name ?? null,
          phase_name: phaseNameForTask(t.project_phase_id, phases),
        })),
    ).slice(0, 10)

    const nextWeekPlan = dedupeWeeklyPlanRowsByDisplay(
      openTasks
        .filter((t: any) => {
          const d = taskStartDate(t.start_date)
          return d != null && d >= thisWeekEnd && d < nextWeekEnd
        })
        .sort((a: any, b: any) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
        .map((t: any) => ({
          text: t.text,
          start_date: t.start_date,
          project_id: t.project_id ?? null,
          project_name: (t.projects as any)?.name ?? project?.name ?? null,
          assignee: (t.contacts as any)?.name ?? null,
          phase_name: phaseNameForTask(t.project_phase_id, phases),
        })),
    ).slice(0, 10)

    // Legacy compatibility: maintain lookahead for older renderers.
    const lookahead = [...thisWeekPlan, ...nextWeekPlan].slice(0, 10)

    // When activity_log has little in the window, still show a useful client-facing snapshot.
    const rawReportData: any = {
      organization_id: schedule.organization_id,
      organization_name: organization?.name || 'Organization',
      project_id: schedule.project_id,
      project_name: project?.name,
      weather_impacts: weatherImpacts,
      schedule_adjustments: scheduleAdjustments,
      daily_site_logs: dailySiteLogs,
      pm_actions: pmActionsMerged,
      pm_action_rows: pmActionRows,
      start_date: startDate,
      end_date: endDate,
      status_changes: statusChanges,
      completed_tasks: reportCompletedTasks,
      phase_progress: phaseProgress,
      all_tasks: tasks,
      all_phases: phases,
      vitals,
      last_week_done: lastWeekDone,
      this_week_plan: thisWeekPlan,
      next_week_plan: nextWeekPlan,
      lookahead,
      snapshot: {
        open_tasks: await Promise.all(openTasks.slice(0, 25).map(async (t: { text?: string; due_date?: string; project_phase_id?: string | null; project_id?: string | null; contacts?: { name?: string } | null; task_photos?: any[]; projects?: { name?: string } | null }) => ({
          text: t.text,
          due_date: t.due_date,
          project_id: (t as any).project_id ?? null,
          project_name: (t as any).projects?.name ?? project?.name ?? null,
          assignee: (t.contacts as any)?.name ?? null,
          phase_name: phaseNameForTask((t as any).project_phase_id, phases),
          photos: includeTaskPhotos
            ? await buildTaskPhotoAssets(supabase, t.task_photos || [], 1)
            : undefined,
        }))),
        phases: visiblePhases.map((p: { name?: string; progress?: number }) => ({
          name: p.name,
          progress: typeof p.progress === 'number' ? p.progress : 0,
        })),
        open_total: openTasks.length,
        completed_total: doneTasks.length,
      },
    }

    // Collect all projects list for executive metrics
    // For single-project reports use [project]; for org-wide it was stored above.
    let allProjects: any[] = []
    if (schedule.project_id && project) {
      allProjects = [project]
    } else {
      const idFilter =
        effectiveProjectIds.length > 0
          ? effectiveProjectIds
          : orgProjectsData.map((p: any) => p.id)
      if (idFilter.length === 0) {
        allProjects = []
      } else {
        const { data: projList, error: projListError } = await fetchInProjectIdChunks(
          idFilter,
          (chunk) =>
            supabase
              .from('projects')
              .select('id, name, status, status_color, due_date, client_due_date')
              .eq('organization_id', schedule.organization_id)
              .in('id', chunk),
        )
        if (projListError) {
          return new Response(
            JSON.stringify({ error: 'Failed to load project summaries for report generation' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            },
          )
        }
        allProjects = projList || []
      }
    }

    // Apply audience-based filtering
    let filteredData = filterDataByAudience(rawReportData, schedule)

    // Standard / internal org reports: per-project slices for email/PDF (stacked like in-app preview).
    if (!schedule.project_id && schedule.report_audience_type !== 'executive') {
      try {
        filteredData.org_project_slices = await buildOrgStandardProjectSlices({
          supabase,
          filteredData,
          tasks,
          phases,
          effectiveProjectIds,
          orgProjectsData,
          schedule,
        })
      } catch (sliceErr) {
        console.error('generate-progress-report: buildOrgStandardProjectSlices', sliceErr)
      }
    }

    // Generate executive content if needed (all audiences benefit from vitals + lookahead)
    if (schedule.report_audience_type === 'executive') {
      filteredData.vitals   = vitals
      filteredData.lookahead = lookahead
      filteredData.executive_summary = generateExecutiveSummary(rawReportData)
      filteredData.at_a_glance       = calculateAtAGlance(rawReportData, allProjects)
      filteredData.key_highlights    = generateKeyHighlights(rawReportData)
      filteredData.project_summary   = generateProjectSummary(rawReportData, allProjects, phases)
    }

    let responseBody: string
    try {
      responseBody = jsonStringifySafe({
        success: true,
        report_data: slimReportPayloadForTransport(rawReportData as Record<string, unknown>),
        filtered_data: slimReportPayloadForTransport(filteredData as Record<string, unknown>),
      })
    } catch (serializeErr) {
      console.error('generate-progress-report: failed to serialize report payload', serializeErr)
      return new Response(
        jsonStringifySafe({
          error: 'Failed to serialize report data',
          details: errorMessageFromUnknown(serializeErr),
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      )
    }

    return new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    })

  } catch (error: unknown) {
    console.error('Error in generate-progress-report:', error)
    return new Response(jsonStringifySafe({ error: errorMessageFromUnknown(error) }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    })
  }
})

function shouldIncludeTaskPhotos(schedule: {
  report_audience_type?: string
  report_sections?: { include_task_photos?: boolean }
}) {
  return schedule.report_audience_type === 'internal' || schedule.report_sections?.include_task_photos === true
}

function rowMatchesOrgSlice(
  row: { project_name?: string | null; project_id?: string | null | undefined },
  pid: string,
  projName: string,
): boolean {
  if (row?.project_id != null && String(row.project_id) === String(pid)) return true
  const pn = row?.project_name != null ? String(row.project_name).trim() : ''
  return pn.length > 0 && pn === String(projName).trim()
}

/** One stacked project block for org-wide standard/internal reports (matches preview). */
async function buildOrgStandardProjectSlices(opts: {
  supabase: ReturnType<typeof createClient>
  filteredData: any
  tasks: any[]
  phases: any[]
  effectiveProjectIds: string[]
  orgProjectsData: any[]
  schedule: any
}): Promise<any[]> {
  const { supabase, filteredData, tasks, phases, effectiveProjectIds, orgProjectsData, schedule } = opts
  const includeTaskPhotos =
    schedule.report_audience_type === 'internal' || schedule.report_sections?.include_task_photos === true

  const projById = new Map<string, any>()
  for (const p of orgProjectsData || []) {
    if (p?.id != null) projById.set(String(p.id), p)
  }

  const sortedIds = [...effectiveProjectIds].sort((a, b) => {
    const na = projById.get(String(a))?.name || ''
    const nb = projById.get(String(b))?.name || ''
    return String(na).localeCompare(String(nb), undefined, { sensitivity: 'base' })
  })

  const slices: any[] = []

  for (const pid of sortedIds) {
    const projMeta = projById.get(String(pid)) || { id: pid, name: 'Project' }
    const projName = projMeta.name || 'Project'

    const projTasks = tasks.filter((t: any) => String(t.project_id ?? '') === String(pid))
    const projPhases = phases.filter((p: any) => String(p.project_id ?? '') === String(pid))
    const openTasks = projTasks.filter((t: any) => !t.completed)
    const doneTasks = projTasks.filter((t: any) => t.completed)

    const keepOriginalCompletionDate = keepOriginalCompletionDateEnabled(schedule.report_sections)
    const scheduleTimeline = computeProjectScheduleTimeline(
      projPhases,
      resolveReportScheduleDueDate(projMeta, keepOriginalCompletionDate),
      new Date(),
      projMeta?.start_date ?? null,
      projTasks,
    )

    const vitals: any = {
      tasks_completed_count: doneTasks.length,
      open_tasks_count: openTasks.length,
      project_end_date: resolveReportProjectEndDate(projMeta, projTasks, keepOriginalCompletionDate),
      ...(scheduleTimeline
        ? {
            schedule_day_current: scheduleTimeline.schedule_day_current,
            schedule_day_total: scheduleTimeline.schedule_day_total,
            schedule_progress_pct: scheduleTimeline.schedule_progress_pct,
          }
        : {}),
    }

    const matches = (row: any) => rowMatchesOrgSlice(row, pid, projName)

    const status_changes = (filteredData.status_changes || []).filter(
      (sc: any) => String(sc.project_id ?? '') === String(pid),
    )
    const completed_tasks = (filteredData.completed_tasks || []).filter(matches)
    const phase_progress = (filteredData.phase_progress || []).filter((p: any) =>
      rowMatchesOrgSlice({ project_name: p.project_name, project_id: null }, pid, projName),
    )
    const weather_impacts = (filteredData.weather_impacts || []).filter((w: any) =>
      rowMatchesOrgSlice({ project_name: w.project_name, project_id: w.project_id }, pid, projName),
    )
    const schedule_adjustments = (filteredData.schedule_adjustments || []).filter((w: any) =>
      rowMatchesOrgSlice({ project_name: w.project_name, project_id: w.project_id }, pid, projName),
    )
    const last_week_done = (filteredData.last_week_done || []).filter(matches)
    const this_week_plan = (filteredData.this_week_plan || []).filter(matches)
    const next_week_plan = (filteredData.next_week_plan || []).filter(matches)

    const projectPmRows = (filteredData.pm_action_rows || []).filter(
      (row: any) => String(row.project_id ?? '') === String(pid),
    )
    const slicePmActions = mergePmActionsNotes(projectPmRows) as Record<string, string> | null

    const visiblePhases = projPhases.filter((p: any) => p.is_client_visible !== false)
    const snapshot = {
      open_tasks: await Promise.all(
        openTasks.slice(0, 25).map(async (t: any) => ({
          text: t.text,
          due_date: t.due_date,
          project_id: t.project_id ?? null,
          project_name: projName,
          assignee: (t.contacts as any)?.name ?? null,
          phase_name: phaseNameForTask(t.project_phase_id, projPhases),
          photos:
            includeTaskPhotos && t.task_photos?.length
              ? await buildTaskPhotoAssets(supabase, t.task_photos || [], 1)
              : undefined,
        })),
      ),
      phases: visiblePhases.map((p: { name?: string; progress?: number }) => ({
        name: p.name,
        progress: typeof p.progress === 'number' ? p.progress : 0,
      })),
      open_total: openTasks.length,
      completed_total: doneTasks.length,
    }

    slices.push({
      project_id: pid,
      project_name: projName,
      project_status: projMeta.status ?? null,
      vitals,
      status_changes,
      completed_tasks,
      phase_progress,
      weather_impacts,
      schedule_adjustments,
      last_week_done,
      this_week_plan,
      next_week_plan,
      lookahead: [...this_week_plan, ...next_week_plan].slice(0, 10),
      snapshot,
      pm_actions: slicePmActions,
    })
  }

  return slices
}

// Filter data based on audience type.
// Standard / client audiences: pass all data through — report_sections flags in the template
// control what is rendered. Phase visibility (is_client_visible) is still filtered here
// because it is a data-privacy concern, not a presentation concern.
function filterDataByAudience(data: any, schedule: any) {
  const audienceType = schedule.report_audience_type
  if (audienceType === 'executive') {
    return {
      organization_id: data.organization_id,
      organization_name: data.organization_name,
      project_name: data.project_name,
      start_date: data.start_date,
      end_date: data.end_date,
      weather_impacts: data.weather_impacts,
      schedule_adjustments: data.schedule_adjustments,
      pm_actions: data.pm_actions,
      pm_action_rows: data.pm_action_rows,
      status_changes: undefined,
      completed_tasks: undefined,
      phase_progress: undefined,
    }
  }

  if (audienceType === 'internal') {
    return {
      ...data,
      phase_progress: (data.phase_progress || []).filter(p => p.is_client_visible !== false),
    }
  }

  // client / standard — strip task photos unless include_task_photos (or legacy internal audience)
  const withPhaseFilter = (payload: any) => ({
    ...payload,
    phase_progress: (data.phase_progress || []).filter((p: { is_client_visible?: boolean }) => p.is_client_visible !== false),
  })

  if (shouldIncludeTaskPhotos(schedule)) {
    return withPhaseFilter({ ...data })
  }

  return withPhaseFilter({ ...stripTaskPhotosFromReport(data) })
}

// ── executive helper: status key + text ───────────────────────────────────────

function deriveStatusKey(status: string | null | undefined): string {
  const s = (status || '').toLowerCase()
  if (s.includes('hold') || s.includes('pause') || s.includes('behind') || s.includes('delay')) return 'behind'
  if (s.includes('risk') || s.includes('concern')) return 'at_risk'
  return 'on_track'
}

function deriveStatusText(status: string | null | undefined): string {
  const key = deriveStatusKey(status)
  if (key === 'behind')   return 'On Hold / Behind'
  if (key === 'at_risk')  return 'At Risk'
  return 'On Track'
}

function generateExecutiveSummary(data: any): string {
  const completed    = data.completed_tasks?.length || 0
  const statusChgs   = data.status_changes?.length  || 0
  const phaseMoved   = data.phase_progress?.length  || 0
  const openCount    = data.snapshot?.open_total    || 0
  const dayCur = data.vitals?.schedule_day_current
  const dayTot = data.vitals?.schedule_day_total
  const schedPct = data.vitals?.schedule_progress_pct
  const wiCount      = data.weather_impacts?.length || 0

  const parts: string[] = []
  if (completed > 0)
    parts.push(`${completed} task${completed !== 1 ? 's' : ''} completed`)
  if (phaseMoved > 0)
    parts.push(`${phaseMoved} phase${phaseMoved !== 1 ? 's' : ''} advanced`)
  if (dayCur != null && dayTot != null)
    parts.push(
      `day ${dayCur} of ${dayTot} on the schedule${schedPct != null ? ` (${schedPct}% through)` : ''}`,
    )
  if (statusChgs > 0)
    parts.push(`${statusChgs} status update${statusChgs !== 1 ? 's' : ''}`)
  if (openCount > 0)
    parts.push(`${openCount} task${openCount !== 1 ? 's' : ''} in progress`)
  if (wiCount > 0)
    parts.push(`${wiCount} weather/schedule impact record${wiCount !== 1 ? 's' : ''} in this period`)

  return parts.length > 0
    ? parts.join(', ').replace(/,([^,]*)$/, ' and$1') + '.'
    : 'No significant changes recorded in this reporting period.'
}

function mapWeatherImpactRows(rows: any[], projectName: string | null): any[] {
  return dedupeOverlappingWeatherImpacts(
    rows.map((w: any) => ({
      id: w.id,
      title: w.title,
      description: w.description,
      days_lost: w.days_lost,
      start_date: w.start_date,
      end_date: w.end_date,
      schedule_shift_applied: w.schedule_shift_applied,
      apply_cascade: w.apply_cascade,
      project_name: projectName || 'Project',
      created_at: w.created_at,
    })),
  )
}

function normalizeImpactDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d
}

function normalizeImpactTitle(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function impactsOverlap(aStart: Date | null, aEnd: Date | null, bStart: Date | null, bEnd: Date | null): boolean {
  const aS = aStart?.getTime() ?? aEnd?.getTime()
  const aE = aEnd?.getTime() ?? aStart?.getTime()
  const bS = bStart?.getTime() ?? bEnd?.getTime()
  const bE = bEnd?.getTime() ?? bStart?.getTime()
  if (aS == null || aE == null || bS == null || bE == null) return false
  return aS <= bE && bS <= aE
}

function dedupeOverlappingWeatherImpacts(rows: any[]): any[] {
  const out: any[] = []
  for (const row of rows || []) {
    const rowStart = normalizeImpactDate(row.start_date || row.created_at)
    const rowEnd = normalizeImpactDate(row.end_date || row.start_date || row.created_at)
    const rowTitle = normalizeImpactTitle(row.title)
    const mergeIndex = out.findIndex((existing) => {
      const existingStart = normalizeImpactDate(existing.start_date || existing.created_at)
      const existingEnd = normalizeImpactDate(existing.end_date || existing.start_date || existing.created_at)
      const sameProject = String(existing.project_name || '') === String(row.project_name || '')
      const overlappingRange = impactsOverlap(existingStart, existingEnd, rowStart, rowEnd)
      const sameTitle = normalizeImpactTitle(existing.title) === rowTitle
      return sameProject && overlappingRange && (sameTitle || rowTitle.includes('rain') || normalizeImpactTitle(existing.title).includes('rain'))
    })
    if (mergeIndex < 0) {
      out.push(row)
      continue
    }
    const existing = out[mergeIndex]
    const mergedStart = [normalizeImpactDate(existing.start_date), rowStart]
      .filter(Boolean)
      .sort((a: Date, b: Date) => a.getTime() - b.getTime())[0]
    const mergedEnd = [normalizeImpactDate(existing.end_date), rowEnd]
      .filter(Boolean)
      .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0]
    out[mergeIndex] = {
      ...existing,
      id: existing.id || row.id,
      title: String(existing.title || '').length >= String(row.title || '').length ? existing.title : row.title,
      description:
        existing.description && row.description && existing.description !== row.description
          ? `${existing.description} | ${row.description}`
          : existing.description || row.description,
      days_lost: Math.max(Number(existing.days_lost || 0), Number(row.days_lost || 0)) || existing.days_lost || row.days_lost,
      start_date: mergedStart ? mergedStart.toISOString().slice(0, 10) : existing.start_date || row.start_date,
      end_date: mergedEnd ? mergedEnd.toISOString().slice(0, 10) : existing.end_date || row.end_date,
      schedule_shift_applied: Boolean(existing.schedule_shift_applied || row.schedule_shift_applied),
      apply_cascade: Boolean(existing.apply_cascade || row.apply_cascade),
      created_at: existing.created_at || row.created_at,
    }
  }
  return out
}

function mapOrgWideWeatherImpactRows(rows: any[]): any[] {
  return dedupeOverlappingWeatherImpacts(
    (rows || []).map((w: any) => ({
    id: w.id,
    title: w.title,
    description: w.description,
    days_lost: w.days_lost,
    start_date: w.start_date,
    end_date: w.end_date,
    schedule_shift_applied: w.schedule_shift_applied,
    apply_cascade: w.apply_cascade,
      project_name: w.projects?.name || 'Project',
    created_at: w.created_at,
    })),
  )
}

function parseDateLike(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toCalendarDayKey(value: string | null | undefined): string | null {
  const parsed = parseDateLike(value)
  if (!parsed) return null
  return parsed.toISOString().slice(0, 10)
}

function weatherImpactFallsInWindow(
  row: { created_at?: string | null; start_date?: string | null; end_date?: string | null },
  windowStartIso: string,
  windowEndIso: string,
): boolean {
  const windowStartDay = toCalendarDayKey(windowStartIso)
  const windowEndDay = toCalendarDayKey(windowEndIso)
  if (!windowStartDay || !windowEndDay) return true

  const createdAtDay = toCalendarDayKey(row.created_at ?? null)
  if (createdAtDay && createdAtDay >= windowStartDay && createdAtDay <= windowEndDay) return true

  const impactStartDay = toCalendarDayKey(row.start_date ?? null)
  const impactEndDay = toCalendarDayKey(row.end_date ?? null)
  if (impactStartDay && impactEndDay) {
    // Inclusive overlap by calendar day.
    return impactStartDay <= windowEndDay && impactEndDay >= windowStartDay
  }
  if (impactStartDay) return impactStartDay >= windowStartDay && impactStartDay <= windowEndDay
  if (impactEndDay) return impactEndDay >= windowStartDay && impactEndDay <= windowEndDay

  return false
}

function calculateAtAGlance(data: any, allProjects: any[]): { on_track: number; at_risk: number; behind: number } {
  if (!allProjects || allProjects.length === 0) {
    // Fallback: infer from a single project if data.project_id exists
    if (data.project_id) {
      const key = deriveStatusKey(data.project_status || null)
      return { on_track: key === 'on_track' ? 1 : 0, at_risk: key === 'at_risk' ? 1 : 0, behind: key === 'behind' ? 1 : 0 }
    }
    return { on_track: 0, at_risk: 0, behind: 0 }
  }
  return allProjects.reduce(
    (acc, p) => {
      const key = deriveStatusKey(p.status)
      acc[key as keyof typeof acc] = (acc[key as keyof typeof acc] || 0) + 1
      return acc
    },
    { on_track: 0, at_risk: 0, behind: 0 }
  )
}

function generateKeyHighlights(data: any): string[] {
  const highlights: string[] = []

  const v = data.vitals
  const periodCompleted = data.completed_tasks?.length ?? 0
  if (periodCompleted > 0)
    highlights.push(`${periodCompleted} task${periodCompleted !== 1 ? 's' : ''} completed this period`)
  if (v?.schedule_day_total != null && v?.schedule_day_current != null)
    highlights.push(
      `Schedule: day ${v.schedule_day_current} of ${v.schedule_day_total}${
        v.schedule_progress_pct != null ? ` (${v.schedule_progress_pct}% through schedule)` : ''
      }`,
    )
  if (data.status_changes?.length > 0)
    highlights.push(`${data.status_changes.length} project status update${data.status_changes.length !== 1 ? 's' : ''}`)
  if (data.phase_progress?.length > 0)
    highlights.push(`${data.phase_progress.length} phase${data.phase_progress.length !== 1 ? 's' : ''} advanced`)
  if (v?.open_tasks_count > 0)
    highlights.push(`${v.open_tasks_count} open task${v.open_tasks_count !== 1 ? 's' : ''} remaining`)
  const wi = data.weather_impacts?.length ?? 0
  if (wi > 0)
    highlights.push(`${wi} weather/schedule impact${wi !== 1 ? 's' : ''} logged this period`)

  return highlights.slice(0, 5)
}

function generateProjectSummary(data: any, allProjects: any[], phases: any[]): any[] {
  if (data.project_id) {
    const proj = allProjects?.[0] || {}
    const projPhases = phases.filter((p: any) => p.is_client_visible !== false)
    const progress = projPhases.length > 0
      ? Math.round(projPhases.reduce((sum: number, p: any) => sum + (p.progress || 0), 0) / projPhases.length)
      : (data.vitals?.schedule_progress_pct ?? 0)
    return [{
      name: proj.name || data.project_name || 'Project',
      status: deriveStatusKey(proj.status),
      status_text: deriveStatusText(proj.status),
      progress,
    }]
  }

  return (allProjects || []).map((proj: any) => {
    const projPhases = phases.filter((p: any) => p.project_id === proj.id && p.is_client_visible !== false)
    const progress = projPhases.length > 0
      ? Math.round(projPhases.reduce((sum: number, p: any) => sum + (p.progress || 0), 0) / projPhases.length)
      : 0
    return {
      name: proj.name || 'Project',
      status: deriveStatusKey(proj.status),
      status_text: deriveStatusText(proj.status),
      progress,
    }
  })
}

function parseActivityDetails(activity: { details?: unknown }): Record<string, unknown> {
  const d = activity?.details
  if (d == null) return {}
  if (typeof d === 'object' && !Array.isArray(d)) return d as Record<string, unknown>
  if (typeof d === 'string') {
    try {
      const parsed = JSON.parse(d) as unknown
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  return {}
}

function stripTaskPhotosFromReport(data: any) {
  return {
    ...data,
    completed_tasks: (data.completed_tasks || []).map((task: any) => ({
      ...task,
      photos: undefined,
    })),
    snapshot: data.snapshot
      ? {
          ...data.snapshot,
          open_tasks: (data.snapshot.open_tasks || []).map((task: any) => ({
            ...task,
            photos: undefined,
          })),
        }
      : data.snapshot,
  }
}

async function createSignedStorageUrl(supabase: any, bucket: string, path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, TASK_PHOTO_SIGNED_URL_TTL_SECONDS)

  if (error) {
    console.error('Could not sign storage path', { bucket, path, error })
    return null
  }

  return data?.signedUrl ?? null
}

async function buildTaskPhotoAssets(supabase: any, photos: any[], limit = MAX_REPORT_PHOTOS_PER_TASK) {
  const sorted = [...(photos || [])]
    .sort((a: any, b: any) => {
      const orderDiff = (a?.sort_order ?? 0) - (b?.sort_order ?? 0)
      if (orderDiff !== 0) return orderDiff
      return new Date(a?.created_at ?? 0).getTime() - new Date(b?.created_at ?? 0).getTime()
    })
    .slice(0, limit)

  return Promise.all(sorted.map(async (photo: any) => {
    const bucket = photo.storage_bucket || 'task_photos'
    const [thumbnail_url, full_url] = await Promise.all([
      createSignedStorageUrl(supabase, bucket, photo.thumbnail_path || photo.storage_path),
      createSignedStorageUrl(supabase, bucket, photo.storage_path),
    ])

    return {
      id: photo.id,
      caption: photo.caption,
      is_completion_photo: photo.is_completion_photo === true,
      thumbnail_url,
      full_url,
    }
  }))
}
