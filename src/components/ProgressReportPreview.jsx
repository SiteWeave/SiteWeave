import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getLocalizedProjectStatus,
  normalizeStatusDisplay,
  PROJECT_STATUS_CANONICAL,
} from '@siteweave/i18n';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import {
  testSendProgressReport,
  computeProjectScheduleTimeline,
  listWeatherImpactsForProject,
} from '@siteweave/core-logic';
import { dedupeTasksById } from '../utils/taskDedupe';
import {
  dedupeLastWeekDoneRowsByDisplay,
  dedupeTasksByNamePhaseStartDate,
  dedupeTasksForLastWeekDone,
  dedupeWeeklyPlanRowsByDisplay,
} from '../utils/taskDuplicateDiagnostics';
import LoadingSpinner from './LoadingSpinner';

const SITEWEAVE_LOGO_URL = 'https://app.siteweave.org/logo.svg';

function TaskPhaseTag({ show, name }) {
  if (!show || !name) return null;
  return (
    <span
      className="ml-1.5 inline-block align-middle max-w-[140px] truncate rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600"
      title={name}
    >
      {name}
    </span>
  );
}

function TaskProjectNameTag({ name }) {
  if (!name) return null;
  return (
    <span className="ml-1.5 inline-block align-middle max-w-[160px] truncate text-[10px] font-medium text-gray-400">
      ({name})
    </span>
  );
}

function isOpenableImageUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function parsePreviewDay(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildPhaseNameMapFromList(phases) {
  const m = {};
  (phases || []).forEach((p) => {
    if (p?.id != null) m[p.id] = p.name;
  });
  return m;
}

/** Standard-report-shaped slice for one project (org stacked preview). */
function computeOrgProjectPreviewSlice({
  project,
  projectTasks,
  projectPhases,
  locale,
  getTaskAssigneeName,
  reportSections,
  showTaskPhotos,
  showTaskPhaseTag,
  weatherImpactsForProject,
  projectNameForTask,
}) {
  const phaseNameById = buildPhaseNameMapFromList(projectPhases);
  const phaseLabelForTask = (task) =>
    task?.project_phase_id ? phaseNameById[task.project_phase_id] || null : null;

  const scoped = dedupeTasksByNamePhaseStartDate(dedupeTasksById(projectTasks));

  const todayDay = new Date();
  todayDay.setHours(0, 0, 0, 0);
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const oneWeekAgo = new Date(todayDay.getTime() - oneWeekMs);
  const thisWeekEnd = new Date(todayDay.getTime() + oneWeekMs);
  const nextWeekEnd = new Date(todayDay.getTime() + 2 * oneWeekMs);

  const completedTasks = (() => {
    const rows = dedupeLastWeekDoneRowsByDisplay(
      dedupeTasksForLastWeekDone(scoped.filter((t) => t?.completed))
        .map((t) => ({
          text: t.text,
          project_id: t.project_id,
          project_name: projectNameForTask(t),
          completed_at: t.completed_at || t.updated_at || t.created_at || null,
          assignee: getTaskAssigneeName(t),
          phase_name: phaseLabelForTask(t),
          photos: showTaskPhotos
            ? (t.task_photos || t.photos || [])
                .slice(0, 2)
                .map((photo) => {
                  const thumb = photo.thumbnail_url || photo.preview_url || photo.full_url || null;
                  const full = photo.full_url || photo.thumbnail_url || photo.preview_url || null;
                  if (!thumb && !full) return null;
                  return {
                    thumbnail_url: thumb || full,
                    full_url: full || thumb,
                    caption: photo.caption,
                    is_completion_photo: photo.is_completion_photo,
                  };
                })
                .filter(Boolean)
            : [],
        })),
    );
    const seen = new Set();
    return rows
      .filter((task) => {
        const completedDate = task?.completed_at ? new Date(task.completed_at) : null;
        const renderedDate = completedDate && !Number.isNaN(completedDate.getTime())
          ? completedDate.toLocaleDateString(locale)
          : '';
        const renderedPhase = showTaskPhaseTag ? String(task?.phase_name ?? '').trim() : '';
        const renderedProject = String(task?.project_name ?? '').trim();
        const renderedKey = [String(task?.text ?? '').trim(), renderedDate, renderedPhase, renderedProject].join('\u0001');
        if (seen.has(renderedKey)) return false;
        seen.add(renderedKey);
        return true;
      })
      .slice(0, 6);
  })();

  const lastWeekDone = dedupeLastWeekDoneRowsByDisplay(
    dedupeTasksForLastWeekDone(
      scoped
        .filter((t) => t?.completed)
        .filter((t) => {
          const completedAt = t.completed_at ? new Date(t.completed_at) : null;
          return completedAt && completedAt >= oneWeekAgo && completedAt < todayDay;
        }),
    )
      .slice(0, 6)
      .map((t) => ({
        text: t.text,
        project_id: t.project_id,
        project_name: projectNameForTask(t),
        completed_at: t.completed_at || t.updated_at || t.created_at || null,
        assignee: getTaskAssigneeName(t),
        phase_name: phaseLabelForTask(t),
      })),
  );

  const thisWeekPlan = dedupeWeeklyPlanRowsByDisplay(
    scoped
      .filter((t) => !t?.completed)
      .filter((t) => {
        const d = parsePreviewDay(t.start_date);
        return d && d >= todayDay && d < thisWeekEnd;
      })
      .map((t) => ({
        text: t.text,
        start_date: t.start_date || null,
        project_id: t.project_id,
        project_name: projectNameForTask(t),
        assignee: getTaskAssigneeName(t),
        phase_name: phaseLabelForTask(t),
      })),
  ).slice(0, 6);

  const nextWeekPlan = dedupeWeeklyPlanRowsByDisplay(
    scoped
      .filter((t) => !t?.completed)
      .filter((t) => {
        const d = parsePreviewDay(t.start_date);
        return d && d >= thisWeekEnd && d < nextWeekEnd;
      })
      .map((t) => ({
        text: t.text,
        start_date: t.start_date || null,
        project_id: t.project_id,
        project_name: projectNameForTask(t),
        assignee: getTaskAssigneeName(t),
        phase_name: phaseLabelForTask(t),
      })),
  ).slice(0, 6);

  const totalTaskCount = scoped.length;
  const completedTaskCount = scoped.filter((t) => t?.completed).length;

  const scheduleTimeline = project
    ? computeProjectScheduleTimeline(
        projectPhases,
        project.due_date,
        new Date(),
        project.start_date ?? null,
        scoped,
      )
    : null;

  const visiblePhases = (projectPhases || []).filter((p) => p.is_client_visible !== false);
  const phaseProgressPreview = visiblePhases.map((p) => ({
    name: p.name,
    progress: typeof p.progress === 'number' ? p.progress : 0,
    old_progress: typeof p.progress === 'number' ? p.progress : 0,
    is_client_visible: true,
  }));

  return {
    vitals: {
      tasks_completed_count: completedTaskCount,
      open_tasks_count: Math.max(0, totalTaskCount - completedTaskCount),
      project_end_date:
        scoped.reduce((max, t) => {
          const d = t?.due_date;
          if (!d) return max;
          return !max || d > max ? d : max;
        }, null) || project?.due_date || null,
      ...(scheduleTimeline
        ? {
            schedule_day_current: scheduleTimeline.schedule_day_current,
            schedule_day_total: scheduleTimeline.schedule_day_total,
            schedule_progress_pct: scheduleTimeline.schedule_progress_pct,
          }
        : {}),
    },
    status_changes: [],
    completed_tasks: completedTasks,
    phase_progress: phaseProgressPreview,
    weather_impacts: weatherImpactsForProject || [],
    last_week_done: lastWeekDone,
    this_week_plan: thisWeekPlan,
    next_week_plan: nextWeekPlan,
  };
}

/** One standard progress-report block (vitals through weekly plan). */
function StandardPreviewSections({
  data,
  reportSections,
  locale,
  translateStatus,
  showTaskPhaseTag,
  showTaskPhotos,
  showProjectNameOnTasks,
  t,
}) {
  const d = data;
  const p = (key, opts) => t(`progressReports.preview.${key}`, opts);

  const formatTaskStartDate = (value) => {
    const parsed = parsePreviewDay(value);
    return parsed ? parsed.toLocaleDateString(locale) : value;
  };

  return (
    <>
      {reportSections.vitals !== false && d.vitals && (
        <div className="flex flex-wrap items-start justify-center gap-x-10 gap-y-3 border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 text-center">
          <div>
            <p className="text-xl font-semibold text-gray-900 tabular-nums">{d.vitals.tasks_completed_count ?? 0}</p>
            <p className="text-xs text-gray-500 mt-0.5 max-w-[9rem]">{p('done_all_time')}</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-gray-900 tabular-nums">{d.vitals.open_tasks_count ?? 0}</p>
            <p className="text-xs text-gray-500 mt-0.5 max-w-[9rem]">{p('not_complete')}</p>
          </div>
          {d.vitals.project_end_date && (
            <div className="sm:border-l sm:border-gray-200 sm:pl-10">
              <p className="text-lg font-semibold text-gray-800 leading-tight">
                {new Date(d.vitals.project_end_date).toLocaleDateString(locale)}
              </p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{p('latest_task_due')}</p>
            </div>
          )}
          {d.vitals.schedule_day_total != null && (
            <div className="sm:border-l sm:border-gray-200 sm:pl-10">
              <p className="text-lg font-semibold text-gray-800 leading-tight">
                {d.vitals.schedule_day_current} / {d.vitals.schedule_day_total}
              </p>
              {d.vitals.schedule_progress_pct != null && (
                <p className="text-xs text-gray-500 mt-0.5">{d.vitals.schedule_progress_pct}%</p>
              )}
              <p className="text-xs text-gray-500 mt-1 font-medium">{p('schedule_business_days')}</p>
            </div>
          )}
        </div>
      )}

      {reportSections.status_changes !== false && (d.status_changes || []).length > 0 && (
        <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/80 p-3">
          <h2 className="text-sm font-semibold text-emerald-900 mb-2 uppercase tracking-wide">{p('status_update')}</h2>
          {(d.status_changes || []).map((change, i) => (
            <div key={i} className="p-2.5 bg-white border border-emerald-200 rounded mb-2 last:mb-0">
              <p className="font-medium text-gray-900 text-sm">{change.project_name}</p>
              <p className="text-xs text-gray-700 mt-0.5">
                <span className="line-through text-gray-400">{translateStatus(change.old_status)}</span>
                <span className="mx-1.5 text-emerald-600">→</span>
                <strong className="text-emerald-800">{translateStatus(change.new_status)}</strong>
                {reportSections.show_who_changed && change.changed_by && (
                  <span className="ml-1.5 text-gray-400">· {change.changed_by}</span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      {reportSections.task_completion !== false && (d.completed_tasks || []).length > 0 && (
        <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/80 p-3">
          <h2 className="text-sm font-semibold text-emerald-900 mb-2 uppercase tracking-wide">{p('completed_work')}</h2>
          {(reportSections.show_assignees || reportSections.show_dates) && !showTaskPhotos ? (
            <table className="w-full text-sm">
              <tbody>
                {(d.completed_tasks || []).map((task, i) => (
                  <tr key={i} className="border-b border-emerald-100 last:border-0">
                    <td className="py-1.5 pr-2 text-emerald-600 font-bold w-4">✓</td>
                    <td className="py-1.5 text-gray-800">
                      {task.text}
                      <TaskPhaseTag show={showTaskPhaseTag} name={task.phase_name} />
                    </td>
                    {reportSections.show_assignees && task.assignee && (
                      <td className="py-1.5 pl-2 text-gray-400 text-xs text-right whitespace-nowrap">@{task.assignee}</td>
                    )}
                    {reportSections.show_dates && task.completed_at && (
                      <td className="py-1.5 pl-2 text-gray-400 text-xs text-right whitespace-nowrap">
                        {new Date(task.completed_at).toLocaleDateString(locale)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <ul className="space-y-3">
              {(d.completed_tasks || []).map((task, i) => (
                <li key={i} className="rounded-md border border-emerald-100 bg-white p-2.5 text-sm text-gray-800">
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-600 font-bold shrink-0">✓</span>
                    <div className="flex-1">
                      <p className="inline">
                        {task.text}
                        <TaskPhaseTag show={showTaskPhaseTag} name={task.phase_name} />
                        {showProjectNameOnTasks ? <TaskProjectNameTag name={task.project_name} /> : null}
                      </p>
                      {(task.assignee || task.completed_at) && (
                        <p className="mt-1 text-xs text-gray-400">
                          {task.assignee ? `@${task.assignee}` : ''}
                          {task.assignee && task.completed_at ? ' · ' : ''}
                          {task.completed_at ? new Date(task.completed_at).toLocaleDateString(locale) : ''}
                        </p>
                      )}
                      {showTaskPhotos && Array.isArray(task.photos) && task.photos.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {task.photos.map((photo, photoIndex) => {
                            const imageUrl = photo.thumbnail_url || photo.full_url;
                            const linkUrl = photo.full_url || photo.thumbnail_url;
                            const content = (
                              <>
                                <img
                                  src={imageUrl}
                                  alt={photo.caption || task.text}
                                  className="h-20 w-24 rounded border border-gray-200 object-cover"
                                />
                                {photo.caption && (
                                  <p className="mt-1 max-w-24 text-[11px] text-gray-500">{photo.caption}</p>
                                )}
                              </>
                            );
                            return isOpenableImageUrl(linkUrl) ? (
                              <a
                                key={photoIndex}
                                href={linkUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block"
                              >
                                {content}
                              </a>
                            ) : (
                              <span key={photoIndex} className="block">
                                {content}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {reportSections.phase_changes !== false && (d.phase_progress || []).length > 0 && (
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50/80 p-3">
          <h2 className="text-sm font-semibold text-blue-900 mb-2 uppercase tracking-wide">{p('phase_progress')}</h2>
          {(d.phase_progress || []).map((phase, i) => (
            <div key={i} className="mb-2.5 last:mb-0">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-gray-700">{phase.name}</span>
                <span className="text-blue-600 font-semibold">
                  {reportSections.show_phase_delta && phase.old_progress != null
                    ? `${phase.old_progress}% → ${phase.progress}%`
                    : `${phase.progress}%`}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${phase.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {reportSections.show_weather_impacts && (d.weather_impacts || []).length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h2 className="text-sm font-semibold text-amber-900 mb-2 uppercase tracking-wide">{p('weather_impacts')}</h2>
          <ul className="space-y-2">
            {(d.weather_impacts || []).map((impact, i) => (
              <li key={i} className="text-sm text-amber-900">
                <span className="font-semibold">{impact.title || p('weather_impact_fallback')}</span>
                {showProjectNameOnTasks && impact.project_name ? (
                  <span className="text-gray-500 font-normal"> ({impact.project_name})</span>
                ) : null}
                {typeof impact.days_lost === 'number'
                  ? ` — ${t('weather.impact_days_lost', { count: impact.days_lost })}`
                  : ''}
                {impact.schedule_shift_applied
                  ? ` · ${t('weather.schedule_updated')}`
                  : ` · ${t('weather.logged_only')}`}
                {impact.description ? (
                  <span className="block text-xs text-amber-800 mt-1">{impact.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reportSections.weekly_plan !== false && (
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{p('weekly_plan')}</h2>

          <div>
            <h3 className="text-xs font-semibold text-emerald-800 mb-1">{p('last_week')}</h3>
            {(d.last_week_done || []).length > 0 ? (
              <ul className="space-y-1">
                {(d.last_week_done || []).map((task, i) => (
                  <li key={`last-${i}`} className="text-sm text-gray-700">
                    <span className="inline">{task.text}</span>
                    <TaskPhaseTag show={showTaskPhaseTag} name={task.phase_name} />
                    {showProjectNameOnTasks ? <TaskProjectNameTag name={task.project_name} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">{p('no_completed_last_week')}</p>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-blue-800 mb-1">{p('this_week')}</h3>
            {(d.this_week_plan || []).length > 0 ? (
              <ul className="space-y-1">
                {(d.this_week_plan || []).map((task, i) => (
                  <li key={`this-${i}`} className="text-sm text-gray-700">
                    <span className="inline">{task.text}</span>
                    <TaskPhaseTag show={showTaskPhaseTag} name={task.phase_name} />
                    {showProjectNameOnTasks ? <TaskProjectNameTag name={task.project_name} /> : null}
                    {task.start_date && (
                      <span className="text-gray-400 ml-1.5 text-xs">{formatTaskStartDate(task.start_date)}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">{p('no_tasks_this_week')}</p>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-indigo-800 mb-1">{p('next_week')}</h3>
            {(d.next_week_plan || []).length > 0 ? (
              <ul className="space-y-1">
                {(d.next_week_plan || []).map((task, i) => (
                  <li key={`next-${i}`} className="text-sm text-gray-700">
                    <span className="inline">{task.text}</span>
                    <TaskPhaseTag show={showTaskPhaseTag} name={task.phase_name} />
                    {showProjectNameOnTasks ? <TaskProjectNameTag name={task.project_name} /> : null}
                    {task.start_date && (
                      <span className="text-gray-400 ml-1.5 text-xs">{formatTaskStartDate(task.start_date)}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">{p('no_tasks_next_week')}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Progress Report Preview Component
 * Shows a live preview of the email using real org/project data where available.
 * Preview layout follows the schedule report type (Standard vs Brief); there is no separate preview toggle.
 */
function ProgressReportPreview({ formData, recipients, scheduleId, projectId: projectIdProp = null }) {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
  const p = (key, opts) => t(`progressReports.preview.${key}`, opts);
  const { state } = useAppContext();
  const { addToast } = useToast();
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [previewPhases, setPreviewPhases] = useState([]);
  const [previewWeatherImpacts, setPreviewWeatherImpacts] = useState([]);

  const previewMode = formData?.report_audience_type === 'executive' ? 'executive' : 'standard';

  /** Schedule row + builder prop — both needed so phase names resolve in the preview */
  const effectiveProjectId = formData?.project_id ?? projectIdProp ?? null;

  const projects = state.projects || [];
  const effectiveIncludedProjectIds = React.useMemo(() => {
    const ids = formData?.included_project_ids;
    if (Array.isArray(ids)) return ids;
    return projects.map((p) => p.id);
  }, [formData?.included_project_ids, projects]);

  const [orgTasks, setOrgTasks] = React.useState(null);

  React.useEffect(() => {
    const pid = effectiveProjectId;
    const ids = effectiveIncludedProjectIds;
    if (pid) {
      const ac = new AbortController();
      (async () => {
        let q = supabaseClient
          .from('project_phases')
          .select('*')
          .eq('project_id', pid)
          .order('order', { ascending: true });
        if (state.currentOrganization?.id) {
          q = q.eq('organization_id', state.currentOrganization.id);
        }
        const { data, error } = await q;
        if (ac.signal.aborted) return;
        if (error) setPreviewPhases([]);
        else setPreviewPhases(data || []);
      })();
      return () => ac.abort();
    }
    if (!ids.length) {
      setPreviewPhases([]);
      return undefined;
    }
    const ac = new AbortController();
    (async () => {
      let q = supabaseClient
        .from('project_phases')
        .select('*')
        .in('project_id', ids)
        .order('order', { ascending: true });
      if (state.currentOrganization?.id) {
        q = q.eq('organization_id', state.currentOrganization.id);
      }
      const { data, error } = await q;
      if (ac.signal.aborted) return;
      if (error) setPreviewPhases([]);
      else setPreviewPhases(data || []);
    })();
    return () => ac.abort();
  }, [effectiveProjectId, effectiveIncludedProjectIds, state.currentOrganization?.id]);

  React.useEffect(() => {
    const pid = effectiveProjectId;
    const ids = effectiveIncludedProjectIds;
    if (pid) {
      const ac = new AbortController();
      (async () => {
        try {
          const rows = await listWeatherImpactsForProject(
            supabaseClient,
            pid,
            state.currentOrganization?.id || null,
          );
          if (ac.signal.aborted) return;
          setPreviewWeatherImpacts(rows || []);
        } catch {
          if (ac.signal.aborted) return;
          setPreviewWeatherImpacts([]);
        }
      })();
      return () => ac.abort();
    }
    if (!ids.length || !state.currentOrganization?.id) {
      setPreviewWeatherImpacts([]);
      return undefined;
    }
    const ac = new AbortController();
    (async () => {
      const { data, error } = await supabaseClient
        .from('weather_impacts')
        .select('*, projects!weather_impacts_project_id_fkey(name)')
        .eq('organization_id', state.currentOrganization.id)
        .in('project_id', ids)
        .order('created_at', { ascending: false });
      if (ac.signal.aborted) return;
      setPreviewWeatherImpacts(error ? [] : data || []);
    })();
    return () => ac.abort();
  }, [effectiveProjectId, effectiveIncludedProjectIds, state.currentOrganization?.id]);

  React.useEffect(() => {
    if (effectiveProjectId) {
      setOrgTasks(null);
      return undefined;
    }
    const ids = effectiveIncludedProjectIds;
    if (!ids.length) {
      setOrgTasks([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      let q = supabaseClient
        .from('tasks')
        .select('*, contacts(name, avatar_url), projects!fk_tasks_project_id(name), task_photos(*)')
        .in('project_id', ids);
      if (state.currentOrganization?.id) {
        q = q.eq('organization_id', state.currentOrganization.id);
      }
      const { data, error } = await q;
      if (cancelled) return;
      if (error) setOrgTasks([]);
      else setOrgTasks(data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveProjectId, effectiveIncludedProjectIds, state.currentOrganization?.id]);

  const phaseNameById = React.useMemo(() => {
    const m = {};
    (previewPhases || []).forEach((p) => {
      if (p?.id != null) m[p.id] = p.name;
    });
    return m;
  }, [previewPhases]);

  const phaseLabelForTask = (task) =>
    task?.project_phase_id ? phaseNameById[task.project_phase_id] || null : null;

  const projectNameForTask = (task) =>
    task?.projects?.name ||
    projects.find((p) => String(p.id) === String(task?.project_id))?.name ||
    null;

  const projectNameForPhase = (phase) =>
    projects.find((p) => String(p.id) === String(phase?.project_id))?.name || null;

  const tasks = state.tasks || [];
  const contacts = state.contacts || [];

  /** Prefer fetched org tasks; until then use in-memory tasks so vitals are not 0/0. */
  const orgTasksResolved = React.useMemo(() => {
    if (effectiveProjectId) return null;
    const fromState = dedupeTasksById(
      tasks.filter((t) => effectiveIncludedProjectIds.some((id) => String(id) === String(t.project_id))),
    );
    if (orgTasks === null) return fromState;
    return orgTasks.length > 0 ? orgTasks : fromState;
  }, [effectiveProjectId, orgTasks, tasks, effectiveIncludedProjectIds]);

  const reportSections = formData?.report_sections || {};
  const showTaskPhaseTag = Boolean(reportSections.show_task_phase);
  const includeTaskPhotosInReport =
    formData?.report_audience_type === 'internal' || reportSections.include_task_photos === true;
  // Preview should always surface available task photos so users can verify visuals.
  const showTaskPhotos = true;
  const selectedProject = effectiveProjectId
    ? projects.find((p) => String(p.id) === String(effectiveProjectId))
    : null;

  const handleSendTest = async () => {
    if (!scheduleId) {
      addToast(p('save_before_test'), 'error');
      return;
    }
    if (!state.user?.email) {
      addToast(p('user_email_not_found'), 'error');
      return;
    }
    setIsSendingTest(true);
    try {
      await testSendProgressReport(supabaseClient, scheduleId, state.user.email);
      addToast(p('test_sent'), 'success');
    } catch (error) {
      addToast(p('test_send_error', { message: error.message }), 'error');
    } finally {
      setIsSendingTest(false);
    }
  };

  const getTaskAssigneeName = (task) => {
    const assigneeId = task?.assignee_id;
    if (!assigneeId) return null;
    return contacts.find((c) => String(c.id) === String(assigneeId))?.name || null;
  };

  const now = new Date();
  const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const previewWindowStartIso = periodStart.toISOString();
  const previewWindowEndIso = now.toISOString();
  const organizationName = state.currentOrganization?.name || t('navigation.organization');
  const projectName = selectedProject?.name || null;

  const scopedTasks = dedupeTasksByNamePhaseStartDate(
    dedupeTasksById(
      selectedProject
        ? tasks.filter((t) => String(t.project_id) === String(selectedProject.id))
        : orgTasksResolved ?? [],
    ),
  );

  const completedTasks = (() => {
    const rows = dedupeLastWeekDoneRowsByDisplay(
      dedupeTasksForLastWeekDone(scopedTasks.filter((t) => t?.completed))
        .map((t) => ({
          text: t.text,
          project_id: t.project_id,
          project_name: projectNameForTask(t),
          completed_at: t.completed_at || t.updated_at || t.created_at || null,
          assignee: getTaskAssigneeName(t),
          phase_name: phaseLabelForTask(t),
          photos: showTaskPhotos
            ? (t.task_photos || t.photos || [])
                .slice(0, 2)
                .map((photo) => {
                  const thumb = photo.thumbnail_url || photo.preview_url || photo.full_url || null;
                  const full = photo.full_url || photo.thumbnail_url || photo.preview_url || null;
                  if (!thumb && !full) return null;
                  return {
                    thumbnail_url: thumb || full,
                    full_url: full || thumb,
                    caption: photo.caption,
                    is_completion_photo: photo.is_completion_photo,
                  };
                })
                .filter(Boolean)
            : [],
        })),
    );

    const seen = new Set();
    return rows
      .filter((task) => {
        const completedDate = task?.completed_at ? new Date(task.completed_at) : null;
        const renderedDate = completedDate && !Number.isNaN(completedDate.getTime())
          ? completedDate.toLocaleDateString(locale)
          : '';
        const renderedPhase = showTaskPhaseTag ? String(task?.phase_name ?? '').trim() : '';
        const renderedProject = String(task?.project_name ?? '').trim();
        const renderedKey = [String(task?.text ?? '').trim(), renderedDate, renderedPhase, renderedProject].join('\u0001');
        if (seen.has(renderedKey)) return false;
        seen.add(renderedKey);
        return true;
      })
      .slice(0, 6);
  })();

  const parseDay = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const todayDay = new Date();
  todayDay.setHours(0, 0, 0, 0);
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const oneWeekAgo = new Date(todayDay.getTime() - oneWeekMs);
  const thisWeekEnd = new Date(todayDay.getTime() + oneWeekMs);
  const nextWeekEnd = new Date(todayDay.getTime() + (2 * oneWeekMs));

  const lastWeekDone = dedupeLastWeekDoneRowsByDisplay(
    dedupeTasksForLastWeekDone(
      scopedTasks
        .filter((t) => t?.completed)
        .filter((t) => {
          const completedAt = t.completed_at ? new Date(t.completed_at) : null;
          return completedAt && completedAt >= oneWeekAgo && completedAt < todayDay;
        }),
    )
      .slice(0, 6)
      .map((t) => ({
        text: t.text,
        project_id: t.project_id,
        project_name: projectNameForTask(t),
        completed_at: t.completed_at || t.updated_at || t.created_at || null,
        assignee: getTaskAssigneeName(t),
        phase_name: phaseLabelForTask(t),
      })),
  );

  const thisWeekPlan = dedupeWeeklyPlanRowsByDisplay(
    scopedTasks
      .filter((t) => !t?.completed)
      .filter((t) => {
        const d = parseDay(t.start_date);
        return d && d >= todayDay && d < thisWeekEnd;
      })
      .map((t) => ({
        text: t.text,
        start_date: t.start_date || null,
        project_id: t.project_id,
        project_name: projectNameForTask(t),
        assignee: getTaskAssigneeName(t),
        phase_name: phaseLabelForTask(t),
      })),
  ).slice(0, 6);

  const nextWeekPlan = dedupeWeeklyPlanRowsByDisplay(
    scopedTasks
      .filter((t) => !t?.completed)
      .filter((t) => {
        const d = parseDay(t.start_date);
        return d && d >= thisWeekEnd && d < nextWeekEnd;
      })
      .map((t) => ({
        text: t.text,
        start_date: t.start_date || null,
        project_id: t.project_id,
        project_name: projectNameForTask(t),
        assignee: getTaskAssigneeName(t),
        phase_name: phaseLabelForTask(t),
      })),
  ).slice(0, 6);

  const totalTaskCount = scopedTasks.length;
  const completedTaskCount = scopedTasks.filter((t) => t?.completed).length;

  const scheduleTimeline = selectedProject
    ? computeProjectScheduleTimeline(
        previewPhases,
        selectedProject.due_date,
        new Date(),
        selectedProject.start_date ?? null,
        scopedTasks
      )
    : null;
  const scheduleVitals = scheduleTimeline || null;

  const visiblePreviewPhases = (previewPhases || []).filter((p) => p.is_client_visible !== false);
  const phaseProgressPreview = visiblePreviewPhases.map((p) => {
    const prog = typeof p.progress === 'number' ? p.progress : 0;
    const projLabel = projectNameForPhase(p);
    const name =
      selectedProject || !projLabel
        ? p.name
        : `${projLabel}: ${p.name}`;
    return {
      name,
      progress: prog,
      old_progress: prog,
      is_client_visible: true,
    };
  });

  const parseDateLike = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const toCalendarDayKey = (value) => {
    const parsed = parseDateLike(value);
    if (!parsed) return null;
    return parsed.toISOString().slice(0, 10);
  };

  const weatherImpactFallsInPreviewWindow = (row) => {
    const windowStartDay = toCalendarDayKey(previewWindowStartIso);
    const windowEndDay = toCalendarDayKey(previewWindowEndIso);
    if (!windowStartDay || !windowEndDay) return true;

    const createdAtDay = toCalendarDayKey(row?.created_at || null);
    if (createdAtDay && createdAtDay >= windowStartDay && createdAtDay <= windowEndDay) return true;

    const impactStartDay = toCalendarDayKey(row?.start_date || null);
    const impactEndDay = toCalendarDayKey(row?.end_date || null);
    if (impactStartDay && impactEndDay) {
      return impactStartDay <= windowEndDay && impactEndDay >= windowStartDay;
    }
    if (impactStartDay) return impactStartDay >= windowStartDay && impactStartDay <= windowEndDay;
    if (impactEndDay) return impactEndDay >= windowStartDay && impactEndDay <= windowEndDay;
    return false;
  };

  const weatherImpactsInWindow = (previewWeatherImpacts || [])
    .filter((row) => weatherImpactFallsInPreviewWindow(row))
    .map((row) => ({
      id: row.id,
      project_id: row.project_id,
      title: row.title,
      description: row.description,
      days_lost: row.days_lost,
      start_date: row.start_date,
      end_date: row.end_date,
      schedule_shift_applied: row.schedule_shift_applied === true,
      project_name:
        row.projects?.name
        || projectNameForTask(row)
        || projectName
        || t('progressReports.builder.untitled_project'),
    }));

  const orgAggregateVitals = React.useMemo(() => {
    if (selectedProject) return null;
    const tot = scopedTasks.length;
    const done = scopedTasks.filter((t) => t?.completed).length;
    return {
      project_count: effectiveIncludedProjectIds.length,
      tasks_completed_count: done,
      open_tasks_count: Math.max(0, tot - done),
    };
  }, [selectedProject, scopedTasks, effectiveIncludedProjectIds]);

  const orgProjectPreviewSlices = React.useMemo(() => {
    if (selectedProject) return null;
    return effectiveIncludedProjectIds.map((pid) => {
      const project = projects.find((p) => String(p.id) === String(pid));
      const projectTasks = scopedTasks.filter((t) => String(t.project_id) === String(pid));
      const projectPhases = (previewPhases || []).filter((p) => String(p.project_id) === String(pid));
      const weatherFor = (weatherImpactsInWindow || []).filter((w) => String(w.project_id) === String(pid));
      return {
        id: String(pid),
        project,
        slice: computeOrgProjectPreviewSlice({
          project: project || { id: pid, name: t('progressReports.builder.untitled_project') },
          projectTasks,
          projectPhases,
          locale,
          getTaskAssigneeName,
          reportSections,
          showTaskPhotos,
          showTaskPhaseTag,
          weatherImpactsForProject: weatherFor,
          projectNameForTask,
        }),
      };
    });
  }, [
    selectedProject,
    effectiveIncludedProjectIds,
    projects,
    scopedTasks,
    previewPhases,
    weatherImpactsInWindow,
    locale,
    getTaskAssigneeName,
    reportSections,
    showTaskPhotos,
    showTaskPhaseTag,
    t,
  ]);

  const baseData = {
    organization_name: organizationName,
    project_name: projectName,
    start_date: periodStart.toISOString(),
    end_date: now.toISOString(),
    weather_impacts: reportSections.show_weather_impacts ? weatherImpactsInWindow : [],
    vitals: {
      tasks_completed_count: completedTaskCount,
      open_tasks_count: Math.max(0, totalTaskCount - completedTaskCount),
      project_end_date:
        scopedTasks.reduce((max, t) => {
          const d = t?.due_date;
          if (!d) return max;
          return !max || d > max ? d : max;
        }, null) || selectedProject?.due_date || null,
      ...(scheduleVitals ? { ...scheduleVitals } : {}),
    },
    last_week_done: lastWeekDone,
    this_week_plan: thisWeekPlan,
    next_week_plan: nextWeekPlan,
    status_changes: [],
    completed_tasks: completedTasks,
    phase_progress: phaseProgressPreview,
  };

  const getPreviewData = (data, mode) => {
    if (mode === 'executive') {
      const deriveStatusKey = (status) => {
        const s = (status || '').toLowerCase();
        if (s.includes('hold') || s.includes('pause') || s.includes('behind') || s.includes('delay')) return 'behind';
        if (s.includes('risk') || s.includes('concern')) return 'at_risk';
        return 'on_track';
      };

      let atAGlance = { on_track: 0, at_risk: 0, behind: 0 };
      if (selectedProject) {
        const k = deriveStatusKey(selectedProject.status);
        atAGlance = {
          on_track: k === 'on_track' ? 1 : 0,
          at_risk: k === 'at_risk' ? 1 : 0,
          behind: k === 'behind' ? 1 : 0,
        };
      } else {
        const list = (projects || []).filter((p) =>
          effectiveIncludedProjectIds.some((id) => String(id) === String(p.id)),
        );
        atAGlance = list.reduce(
          (acc, p) => {
            const k = deriveStatusKey(p.status);
            acc[k] = (acc[k] || 0) + 1;
            return acc;
          },
          { on_track: 0, at_risk: 0, behind: 0 },
        );
      }

      const startMs = new Date(data.start_date).getTime();
      const endMs = new Date(data.end_date).getTime();
      const periodCompleted = scopedTasks.filter((t) => {
        if (!t?.completed) return false;
        const ca = t.completed_at || t.updated_at || t.created_at;
        if (!ca) return false;
        const ts = new Date(ca).getTime();
        return !Number.isNaN(ts) && ts >= startMs && ts <= endMs;
      }).length;

      const v = data.vitals;
      const wiCount = (data.weather_impacts || []).length;
      const openCount = v?.open_tasks_count ?? Math.max(0, totalTaskCount - completedTaskCount);

      const totalProjectsInScope = selectedProject ? 1 : effectiveIncludedProjectIds.length;

      const parts = [];
      if (!selectedProject && totalProjectsInScope > 0) {
        parts.push(
          p(totalProjectsInScope === 1 ? 'summary_covers_one' : 'summary_covers_other', {
            count: totalProjectsInScope,
          }),
        );
      }
      if (periodCompleted > 0) {
        parts.push(
          p(periodCompleted === 1 ? 'tasks_completed_period_one' : 'tasks_completed_period_other', {
            count: periodCompleted,
          }),
        );
      }
      if (v?.schedule_day_current != null && v?.schedule_day_total != null) {
        const schedPct = v.schedule_progress_pct;
        parts.push(
          p('schedule_day', {
            current: v.schedule_day_current,
            total: v.schedule_day_total,
            pctSuffix: schedPct != null ? p('schedule_pct_suffix', { pct: schedPct }) : '',
          }),
        );
      }
      if (openCount > 0) {
        parts.push(p(openCount === 1 ? 'open_tasks_one' : 'open_tasks_other', { count: openCount }));
      }
      if (wiCount > 0) {
        parts.push(
          p(wiCount === 1 ? 'weather_records_one' : 'weather_records_other', { count: wiCount }),
        );
      }

      const executive_summary =
        parts.length > 0
          ? `${new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(parts)}.`
          : p('no_changes');

      const highlights = [];
      if (periodCompleted > 0) {
        highlights.push({ type: 'period_completed', count: periodCompleted });
      }
      if (v?.schedule_day_total != null && v?.schedule_day_current != null) {
        highlights.push({
          type: 'schedule',
          current: v.schedule_day_current,
          total: v.schedule_day_total,
          pct: v.schedule_progress_pct ?? null,
        });
      }
      if (data.last_week_done?.length) {
        highlights.push({ type: 'last_week', count: data.last_week_done.length });
      }
      if (data.this_week_plan?.length) {
        highlights.push({ type: 'this_week', count: data.this_week_plan.length });
      }
      if (data.next_week_plan?.length) {
        highlights.push({ type: 'next_week', count: data.next_week_plan.length });
      }
      if (v?.open_tasks_count > 0) {
        highlights.push({
          type: 'open_tasks',
          count: v.open_tasks_count,
          projects: totalProjectsInScope,
        });
      }
      if (wiCount > 0) {
        highlights.push({ type: 'weather', count: wiCount });
      }

      return {
        organization_name: data.organization_name,
        project_name: data.project_name,
        start_date: data.start_date,
        end_date: data.end_date,
        executive_summary,
        at_a_glance: atAGlance,
        key_highlights: highlights.slice(0, 5),
      };
    }
    // standard — return all data; template flags control what to render
    return data;
  };

  const previewData = getPreviewData(baseData, previewMode);

  const clientFriendly = reportSections.client_friendly_labels !== false;
  const translateStatus = (status) => {
    if (!status) return '';
    if (!clientFriendly) {
      return getLocalizedProjectStatus(status, t);
    }
    const canonical = normalizeStatusDisplay(status);
    const friendlyByCanonical = {
      [PROJECT_STATUS_CANONICAL.in_progress]: p('status_in_progress'),
      [PROJECT_STATUS_CANONICAL.on_hold]: p('status_on_hold'),
      [PROJECT_STATUS_CANONICAL.completed]: p('status_completed'),
    };
    return friendlyByCanonical[canonical] || getLocalizedProjectStatus(status, t);
  };

  const subjectName = previewMode === 'executive'
    ? previewData.organization_name || t('navigation.organization')
    : previewData.project_name || previewData.organization_name || p('your_project');

  const defaultSubject = previewMode === 'executive'
    ? p('brief_subject', { name: subjectName })
    : p('progress_subject', { name: subjectName });

  const renderExecutiveHighlight = (item) => {
    switch (item?.type) {
      case 'period_completed':
        return `${item.count} ${p('done_all_time').toLowerCase()}`;
      case 'schedule':
        return `${p('schedule_business_days')}: ${item.current}/${item.total}${
          item.pct != null ? ` (${item.pct}%)` : ''
        }`;
      case 'last_week':
        return `${item.count} — ${p('last_week')}`;
      case 'this_week':
        return `${item.count} — ${p('this_week')}`;
      case 'next_week':
        return `${item.count} — ${p('next_week')}`;
      case 'open_tasks':
        return `${item.count} ${p('not_complete').toLowerCase()} · ${item.projects} ${t('progressReports.builder.projects_in_report').toLowerCase()}`;
      case 'weather':
        return `${item.count} ${p('weather_impacts')}`;
      default:
        return '';
    }
  };

  const toDisplay = recipients.length > 0
    ? recipients.slice(0, 3).map((r) => r.email).join(', ')
    + (recipients.length > 3 ? p('recipients_more', { count: recipients.length - 3 }) : '')
    : p('recipients_placeholder');
  const fromDisplay = state.currentOrganization?.name
    ? `${state.currentOrganization.name} <notifications@siteweave.org>`
    : p('from_fallback');
  const dateDisplay = now.toLocaleString(locale, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="space-y-4">
      {/* Controls — single header row */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900 min-w-0">
          {p('preview_title')}:{' '}
          <span className="font-semibold text-gray-700">
            {previewMode === 'executive' ? p('mode_brief') : p('mode_standard')}
          </span>
        </p>

        {scheduleId && (
          <button type="button"
            onClick={handleSendTest}
            disabled={isSendingTest}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSendingTest ? (
              <>
                <LoadingSpinner size="sm" text="" />
                {p('sending_test')}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {p('send_test')}
              </>
            )}
          </button>
        )}
      </div>

      {/* Outlook-style email frame */}
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-[#f3f3f3] shadow-inner">
        {/* Email header */}
        <div className="bg-white border-b border-gray-200 px-3 py-2.5">
          {[
            { label: p('email_from'), value: fromDisplay },
            { label: p('email_to'), value: toDisplay },
            { label: p('email_date'), value: dateDisplay },
            { label: p('email_subject'), value: formData.custom_subject || defaultSubject, bold: true },
          ].map(({ label, value, bold }) => (
            <div key={label} className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700 mt-1 first:mt-0">
              <span className="shrink-0 font-medium text-gray-500 w-14">{label}</span>
              <span className={`min-w-0 break-all ${bold ? 'font-semibold text-gray-900' : ''}`}>{value}</span>
            </div>
          ))}
        </div>

        {/* Message body */}
        <div className="bg-white p-4 min-h-[200px]">
          <div className="max-w-[600px] mx-auto font-sans text-[15px] text-gray-800 leading-relaxed">
            <div className="space-y-4">
              {/* Title + period */}
              <div>
                <p
                  className="text-xl font-bold text-gray-900 leading-snug"
                  style={{ fontFamily: 'Calibri, Segoe UI, sans-serif' }}
                >
                  {previewMode === 'executive' ? p('mode_brief') : p('progress_update')}
                  <span className="text-gray-400 font-semibold"> — </span>
                  <span className="font-semibold text-blue-600">
                    {previewData.project_name || previewData.organization_name || p('your_project')}
                  </span>
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  {new Date(previewData.start_date).toLocaleDateString(locale)} –{' '}
                  {new Date(previewData.end_date).toLocaleDateString(locale)}
                </p>
              </div>

              {/* Personal message */}
              {formData.custom_message && (
                <div className="p-3 bg-blue-50 border-l-4 border-blue-500 rounded">
                  <p className="text-sm text-gray-700">{formData.custom_message}</p>
                </div>
              )}

              {/* ── EXECUTIVE ── */}
              {previewMode === 'executive' && (
                <>
                  {previewData.executive_summary && (
                    <div className="rounded-lg border-2 border-blue-200 bg-blue-50/90 p-4">
                      <h2 className="text-base font-semibold text-blue-900 mb-2">{p('executive_summary')}</h2>
                      <p className="text-sm text-blue-900">{previewData.executive_summary}</p>
                    </div>
                  )}
                  {previewData.at_a_glance && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <h2 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">{p('at_a_glance')}</h2>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: p('on_track'), val: previewData.at_a_glance.on_track || 0, cls: 'bg-green-50 border-green-200', textCls: 'text-green-800', subCls: 'text-green-700' },
                          { label: p('at_risk'), val: previewData.at_a_glance.at_risk || 0, cls: 'bg-amber-50 border-amber-200', textCls: 'text-amber-800', subCls: 'text-amber-700' },
                          { label: p('behind'), val: previewData.at_a_glance.behind || 0, cls: 'bg-red-50 border-red-200', textCls: 'text-red-800', subCls: 'text-red-700' },
                        ].map(({ label, val, cls, textCls, subCls }) => (
                          <div key={label} className={`p-3 border rounded text-center ${cls}`}>
                            <p className={`text-2xl font-bold ${textCls}`}>{val}</p>
                            <p className={`text-xs mt-0.5 font-medium ${subCls}`}>{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(previewData.key_highlights) && previewData.key_highlights.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <h2 className="text-sm font-semibold text-amber-900 mb-2 uppercase tracking-wide">{p('key_highlights')}</h2>
                      <ul className="space-y-1.5">
                        {previewData.key_highlights.map((h, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                            <span className="text-amber-500 font-bold shrink-0">•</span>
                            <span>{renderExecutiveHighlight(h)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {/* ── STANDARD: single project vs stacked per-project (org) ── */}
              {previewMode === 'standard' && selectedProject && (
                <StandardPreviewSections
                  data={previewData}
                  reportSections={reportSections}
                  locale={locale}
                  translateStatus={translateStatus}
                  showTaskPhaseTag={showTaskPhaseTag}
                  showTaskPhotos={showTaskPhotos}
                  showProjectNameOnTasks={false}
                  t={t}
                />
              )}
              {previewMode === 'standard' && !selectedProject && orgProjectPreviewSlices && (
                <>
                  {reportSections.vitals !== false && orgAggregateVitals && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 mb-4">
                      <p className="text-sm text-slate-800 leading-snug">
                        <span className="font-semibold">{orgAggregateVitals.project_count}</span>
                        {' '}
                        {t('progressReports.builder.projects_in_report').toLowerCase()}
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span className="font-semibold tabular-nums">{orgAggregateVitals.tasks_completed_count}</span>
                        {' '}
                        {p('done_all_time').toLowerCase()}
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span className="font-semibold tabular-nums">{orgAggregateVitals.open_tasks_count}</span>
                        {' '}
                        {p('not_complete').toLowerCase()}
                      </p>
                    </div>
                  )}
                  <div className="space-y-5">
                    {orgProjectPreviewSlices.map(({ id, project, slice }) => (
                      <section
                        key={id}
                        className="rounded-lg border border-gray-200 bg-gray-50/90 p-3 sm:p-4 shadow-sm space-y-4"
                      >
                        <div className="border-b border-gray-200 pb-2">
                          <h2 className="text-base font-bold text-gray-900">
                            {project?.name || t('progressReports.builder.untitled_project')}
                          </h2>
                          {project?.status ? (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {p('status_label', { status: translateStatus(project.status) })}
                            </p>
                          ) : null}
                        </div>
                        <StandardPreviewSections
                          data={slice}
                          reportSections={reportSections}
                          locale={locale}
                          translateStatus={translateStatus}
                          showTaskPhaseTag={showTaskPhaseTag}
                          showTaskPhotos={showTaskPhotos}
                          showProjectNameOnTasks={false}
                          t={t}
                        />
                      </section>
                    ))}
                  </div>
                </>
              )}

              <div className="pt-4 mt-2 border-t border-gray-200 text-center">
                <div className="inline-flex items-center gap-2.5 text-left max-w-full">
                  <img
                    src={SITEWEAVE_LOGO_URL}
                    alt="SiteWeave"
                    className="w-9 h-9 shrink-0"
                    width={36}
                    height={36}
                  />
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-400 m-0 leading-snug">{p('generated_by')}</p>
                    <p className="text-[11px] text-gray-400 m-0 mt-0.5 leading-snug">
                      {state.currentOrganization?.name || t('navigation.organization')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 italic">
        {selectedProject ? p('preview_hint_project') : p('preview_hint_org')}
      </p>
    </div>
  );
}

export default ProgressReportPreview;
