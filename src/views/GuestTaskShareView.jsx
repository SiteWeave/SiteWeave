import React from 'react'
import { useParams } from 'react-router-dom'
import LoadingSpinner from '../components/LoadingSpinner'

const fnBase = () => {
  const url = import.meta.env.VITE_SUPABASE_URL
  if (!url) throw new Error('VITE_SUPABASE_URL is not set')
  return `${url.replace(/\/$/, '')}/functions/v1/guest-task-share`
}

function parseDateOnly(iso) {
  if (!iso) return null
  const s = String(iso).slice(0, 10)
  const [y, m, d] = s.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return new Date(Date.UTC(y, m - 1, d))
}

/** Whole calendar days from today (local) until startDate (date-only) */
function daysUntilOnSite(startDate) {
  const start = parseDateOnly(startDate)
  if (!start) return null
  const now = new Date()
  const utcToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const utcStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  return Math.round((utcStart - utcToday) / (24 * 60 * 60 * 1000))
}

/**
 * On-site urgency for the guest's own linked tasks only (second person).
 * @returns {{ severity: 'critical' | 'warning' | 'info', message: string } | null}
 */
function getOnSiteNotice(task) {
  if (task.completed) return null
  if (!task.start_date) return null
  const days = daysUntilOnSite(task.start_date)
  if (days === null) return null
  if (days < 0) {
    return {
      severity: 'critical',
      message: 'This on-site date has passed. Contact your PM if that is unexpected.',
    }
  }
  if (days === 0) {
    return {
      severity: 'critical',
      message: 'You need to be on site today.',
    }
  }
  if (days === 1) {
    return {
      severity: 'critical',
      message: '1 day until you need to be on site.',
    }
  }
  if (days === 2) {
    return {
      severity: 'critical',
      message: '2 days until you need to be on site.',
    }
  }
  if (days <= 7) {
    return {
      severity: 'warning',
      message: `${days} days until you need to be on site.`,
    }
  }
  return {
    severity: 'info',
    message: `${days} days until you need to be on site.`,
  }
}

function noticeClass(severity) {
  if (severity === 'critical') {
    return 'bg-rose-500/95 text-white border-b-2 border-rose-800/40 shadow-sm'
  }
  if (severity === 'warning') {
    return 'bg-amber-500 text-amber-950 border-b-2 border-amber-700/70 shadow-sm'
  }
  return 'bg-sky-100 text-sky-950 border-b border-sky-200'
}

function cardBorderClass(task, notice, interactive) {
  if (!interactive) {
    return task.completed ? 'border border-gray-200' : 'border border-gray-200'
  }
  if (task.completed) return 'border border-gray-200'
  if (!notice) {
    return task.start_date ? 'border-2 border-amber-400/80' : 'border border-amber-200'
  }
  if (notice.severity === 'critical') return 'border-2 border-rose-400/90 ring-1 ring-rose-200/50'
  if (notice.severity === 'warning') return 'border-2 border-amber-600'
  return 'border-2 border-sky-300'
}

/** e.g. "May 12, 2026" for task cards */
function formatLongMonthDate(iso) {
  if (!iso) return ''
  const d = parseDateOnly(iso)
  if (!d) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function formatShortDate(iso) {
  if (!iso) return ''
  const d = parseDateOnly(iso)
  if (!d) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function buildDepIndex(taskIds, dependencies) {
  const byId = new Map()
  for (const id of taskIds) {
    byId.set(id, { dependsOn: [], unlocks: [] })
  }
  for (const d of dependencies || []) {
    const pred = String(d.task_id)
    const succ = String(d.successor_task_id)
    const pLabel = d.predecessor_summary || 'Task'
    const sLabel = d.successor_summary || 'Task'
    if (byId.has(succ)) {
      byId.get(succ).dependsOn.push(pLabel)
    }
    if (byId.has(pred)) {
      byId.get(pred).unlocks.push(sLabel)
    }
  }
  return byId
}

function stripSensitiveTask(task) {
  const { priority: _p, percent_complete: _pc, ...rest } = task
  return rest
}

/** Sort key: earlier due dates first; tasks without due date last */
function dueDateSortKey(task) {
  const d = task.due_date
  if (!d) return Number.POSITIVE_INFINITY
  const t = parseDateOnly(d)
  return t ? t.getTime() : Number.POSITIVE_INFINITY
}

function sortTasksByDueDate(tasks) {
  return [...tasks].sort((a, b) => {
    const ka = dueDateSortKey(a)
    const kb = dueDateSortKey(b)
    if (ka !== kb) return ka - kb
    const ca = String(a.created_at || '')
    const cb = String(b.created_at || '')
    if (ca !== cb) return ca < cb ? -1 : ca > cb ? 1 : 0
    return String(a.id).localeCompare(String(b.id))
  })
}

/** Dates between title and photo: larger type, month names */
function TaskDatesInline({ startDate, dueDate }) {
  const parts = []
  if (startDate) {
    parts.push(
      <p key="on" className="leading-tight">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 block sm:inline sm:mr-1">
          On-site
        </span>
        <span className="text-base sm:text-lg font-semibold text-gray-900">{formatLongMonthDate(startDate)}</span>
      </p>,
    )
  }
  if (dueDate) {
    parts.push(
      <p key="due" className="leading-tight">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 block sm:inline sm:mr-1">
          Due
        </span>
        <span className="text-base sm:text-lg font-semibold text-gray-900">{formatLongMonthDate(dueDate)}</span>
      </p>,
    )
  }
  if (!parts.length) {
    return <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">No dates</span>
  }
  return <div className="flex flex-col gap-1 text-right sm:min-w-[10rem] shrink-0">{parts}</div>
}

export default function GuestTaskShareView() {
  const { token } = useParams()
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [payload, setPayload] = React.useState(null)
  const [uploadingTaskId, setUploadingTaskId] = React.useState(null)
  const [uploadError, setUploadError] = React.useState(null)
  const fileInputs = React.useRef({})

  const rawToken = React.useMemo(() => {
    if (!token) return ''
    try {
      return decodeURIComponent(token)
    } catch {
      return token
    }
  }, [token])

  const load = React.useCallback(async () => {
    if (!rawToken) {
      setError('Invalid link')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(fnBase(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${rawToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.error || 'This link is invalid or has expired.')
        setPayload(null)
        return
      }
      setPayload(body)
    } catch (e) {
      setError(e?.message || 'Could not load this page.')
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [rawToken])

  React.useEffect(() => {
    load()
  }, [load])

  const depIndex = React.useMemo(() => {
    if (!payload?.tasks) return new Map()
    const ids = payload.tasks.map((t) => String(t.id))
    return buildDepIndex(ids, payload.task_dependencies)
  }, [payload])

  const sortedTasks = React.useMemo(() => {
    if (!payload?.tasks) return []
    return sortTasksByDueDate((payload.tasks || []).map(stripSensitiveTask))
  }, [payload])

  const handlePickFile = (taskId) => {
    setUploadError(null)
    fileInputs.current[taskId]?.click()
  }

  const handleFileChange = async (taskId, event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !rawToken) return

    setUploadingTaskId(taskId)
    setUploadError(null)
    try {
      const form = new FormData()
      form.set('task_id', taskId)
      form.set('file', file)

      const res = await fetch(fnBase(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${rawToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: form,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUploadError(body?.error || 'Upload failed')
        return
      }
      const photo = body?.photo
      if (photo) {
        setPayload((prev) => {
          if (!prev?.tasks) return prev
          return {
            ...prev,
            tasks: prev.tasks.map((t) => {
              if (t.id !== taskId) return t
              const photos = [...(t.photos || []), photo]
              return { ...t, photos }
            }),
          }
        })
      } else {
        await load()
      }
    } catch (e) {
      setUploadError(e?.message || 'Upload failed')
    } finally {
      setUploadingTaskId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <LoadingSpinner size="lg" text="Loading tasks…" />
      </div>
    )
  }

  if (error || !payload) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Unable to open link</h1>
        <p className="text-gray-600 max-w-md">{error || 'Something went wrong.'}</p>
      </div>
    )
  }

  const { project, weather_impacts = [], field_issues = [] } = payload

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">SiteWeave · View only</p>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mt-1">{project?.name || 'Project'}</h1>
          {project?.address ? (
            <p className="text-sm text-gray-600 mt-1">{project.address}</p>
          ) : null}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <p className="text-sm text-gray-600 max-w-3xl mb-4">
          Tasks shared with you on this link can use on-site reminders and photo uploads. Other project tasks,
          weather impacts, and field issues are shown for context only — nothing here can be edited.
        </p>

        {uploadError ? (
          <div className="rounded-md bg-red-50 text-red-800 text-sm px-3 py-2 mb-6 max-w-3xl">{uploadError}</div>
        ) : null}

        <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:gap-8">
          <div className="w-full lg:w-[65%] lg:min-w-0 lg:flex-shrink-0">
            <ul className="space-y-3">
              {sortedTasks.map((task) => {
                const interactive = task.guest_interactive === true
                const notice = interactive ? getOnSiteNotice(task) : null
                const deps = depIndex.get(String(task.id)) || { dependsOn: [], unlocks: [] }

                return (
                  <li
                    id={`task-${task.id}`}
                    key={task.id}
                    className={`scroll-mt-24 rounded-lg bg-white shadow-sm overflow-hidden ${cardBorderClass(task, notice, interactive)} ${interactive ? '' : 'opacity-[0.72]'}`}
                  >
                    {notice ? (
                      <div
                        className={`px-3 py-2.5 sm:px-4 text-center text-sm sm:text-base font-semibold tracking-tight ${noticeClass(notice.severity)}`}
                        role="status"
                      >
                        {notice.message}
                      </div>
                    ) : null}

                    <div className="px-3 py-3 sm:px-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                        <div className="flex items-start gap-2 min-w-0 sm:flex-1">
                          {!interactive ? (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-500 font-semibold bg-gray-100 px-1.5 py-0.5 rounded mt-0.5">
                              View only
                            </span>
                          ) : null}
                          {task.completed ? (
                            <span className="shrink-0 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 uppercase mt-0.5">
                              Completed
                            </span>
                          ) : null}
                          <span
                            className={`min-w-0 sm:flex-1 text-sm sm:text-base leading-snug sm:line-clamp-2 ${task.completed ? 'text-gray-500 line-through' : 'font-medium text-gray-900'}`}
                          >
                            {task.text || 'Task'}
                          </span>
                        </div>

                        <div className="flex items-start justify-end gap-3 sm:flex-nowrap sm:shrink-0">
                          <TaskDatesInline startDate={task.start_date} dueDate={task.due_date} />

                          <div className="flex items-center gap-2 shrink-0">
                            {interactive && !task.completed && !task.start_date ? (
                              <span className="text-xs text-amber-800 font-medium whitespace-nowrap hidden sm:inline">
                                No on-site date
                              </span>
                            ) : null}
                            {interactive && !task.completed ? (
                              <>
                                <input
                                  ref={(el) => {
                                    fileInputs.current[task.id] = el
                                  }}
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  onChange={(e) => handleFileChange(task.id, e)}
                                  aria-label={`Add photo for ${task.text || 'task'}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => handlePickFile(task.id)}
                                  disabled={uploadingTaskId === task.id}
                                  className="inline-flex items-center rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
                                >
                                  {uploadingTaskId === task.id ? '…' : 'Photo'}
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {(deps.dependsOn.length > 0 || deps.unlocks.length > 0) ? (
                        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600 space-y-0.5">
                          {deps.dependsOn.length > 0 ? (
                            <p>
                              <span className="font-medium text-gray-700">Depends on: </span>
                              {[...new Set(deps.dependsOn)].join(' · ')}
                            </p>
                          ) : null}
                          {deps.unlocks.length > 0 ? (
                            <p>
                              <span className="font-medium text-gray-700">Following tasks: </span>
                              {[...new Set(deps.unlocks)].join(' · ')}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {task.photos?.length ? (
                      <div className="px-3 pb-3 sm:px-4 grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                        {task.photos.map((p) => (
                          <a
                            key={p.id}
                            href={p.full_url || '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="block aspect-square rounded overflow-hidden bg-gray-100 border border-gray-200"
                          >
                            {p.thumbnail_url || p.full_url ? (
                              <img
                                src={p.thumbnail_url || p.full_url}
                                alt={p.caption || 'Task photo'}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
                                Photo
                              </div>
                            )}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>

          <aside className="w-full lg:w-[35%] lg:min-w-0 space-y-6 lg:sticky lg:top-4">
            <section
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              aria-labelledby="guest-weather-heading"
            >
              <h2 id="guest-weather-heading" className="text-sm font-semibold text-gray-900">
                Weather and schedule <span className="font-normal text-gray-500">(read-only)</span>
              </h2>
              {weather_impacts.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {weather_impacts.map((w) => (
                    <li key={w.id} className="text-sm border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                      <p className="font-medium text-gray-900">
                        {w.title}{' '}
                        <span className="text-gray-500 font-normal">
                          ({w.impact_type === 'weather' ? 'Weather' : 'Schedule'}) · {w.days_lost} day{w.days_lost === 1 ? '' : 's'} impact
                        </span>
                      </p>
                      {(w.start_date || w.end_date) ? (
                        <p className="text-xs text-gray-600 mt-0.5">
                          {w.start_date ? formatShortDate(w.start_date) : '—'}
                          {w.end_date ? ` – ${formatShortDate(w.end_date)}` : ''}
                        </p>
                      ) : null}
                      {w.description ? <p className="text-gray-600 mt-1 whitespace-pre-wrap">{w.description}</p> : null}
                      {w.affected_task_labels?.length ? (
                        <p className="text-xs text-gray-600 mt-2">
                          Affected tasks:{' '}
                          {w.affected_task_labels.map((lab, i) => (
                            <React.Fragment key={lab.id}>
                              {i > 0 ? ', ' : ''}
                              <a href={`#task-${lab.id}`} className="text-blue-700 underline hover:text-blue-900">
                                {lab.text}
                              </a>
                            </React.Fragment>
                          ))}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No weather or schedule impacts recorded.</p>
              )}
            </section>

            <section
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              aria-labelledby="guest-issues-heading"
            >
              <h2 id="guest-issues-heading" className="text-sm font-semibold text-gray-900">
                Field issues <span className="font-normal text-gray-500">(read-only)</span>
              </h2>
              {field_issues.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {field_issues.map((issue) => (
                    <li key={issue.id} className="text-sm border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                      <p className="font-medium text-gray-900">{issue.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Status: {issue.status}
                        {issue.due_date ? ` · Due ${formatShortDate(issue.due_date)}` : ''}
                      </p>
                      {issue.description ? (
                        <p className="text-gray-600 mt-1 line-clamp-4 whitespace-pre-wrap">{issue.description}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No field issues recorded.</p>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
