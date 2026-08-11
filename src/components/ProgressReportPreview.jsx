import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import {
  testSendProgressReport,
  computeProjectScheduleTimeline,
  listWeatherImpactsForProject,
  listScheduleAdjustmentsForProject,
  listPmActionsInWindow,
  mergePmActionsNotes,
  resolveReportProjectEndDate,
  resolveReportScheduleDueDate,
  getOrganizationBranding,
} from '@siteweave/core-logic';
import { dedupeTasksById } from '../utils/taskDedupe';
import {
  dedupeLastWeekDoneRowsByDisplay,
  dedupeTasksByNamePhaseStartDate,
  dedupeTasksForLastWeekDone,
  dedupeWeeklyPlanRowsByDisplay,
} from '../utils/taskDuplicateDiagnostics';
import {
  generateStandardReportEmail,
  generateExecutiveReportEmail,
} from '../utils/progressReportEmailTemplates';
import { buildPreviewEmailPayload } from '../utils/mapProgressReportPreviewToEmail';
import LoadingSpinner from './LoadingSpinner';

function parsePreviewDay(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Effective task end: due_date, else start_date + duration_days - 1, else start_date. */
function previewTaskEndDate(task) {
  if (typeof task?.due_date === 'string' && task.due_date.length > 0) return task.due_date;
  if (typeof task?.start_date !== 'string' || task.start_date.length === 0) return null;
  const durationRaw = Number(task.duration_days);
  const durationDays = Number.isFinite(durationRaw) ? Math.max(1, Math.trunc(durationRaw)) : 1;
  const start = parsePreviewDay(task.start_date);
  if (!start) return null;
  const end = new Date(start.getTime() + (durationDays - 1) * 24 * 60 * 60 * 1000);
  return end.toISOString().slice(0, 10);
}

/** True when an open task's schedule overlaps [windowStart, windowEnd). */
function taskOverlapsPreviewWindow(task, windowStart, windowEnd) {
  const start = parsePreviewDay(task?.start_date);
  if (!start) return false;
  const end = parsePreviewDay(previewTaskEndDate(task));
  if (!end) return false;
  return start < windowEnd && end >= windowStart;
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
  scheduleAdjustmentsForProject,
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
                .slice(0, 3)
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
      .slice(0, 10);
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
      .slice(0, 10)
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
      .filter((t) => taskOverlapsPreviewWindow(t, todayDay, thisWeekEnd))
      .map((t) => ({
        text: t.text,
        start_date: t.start_date || null,
        project_id: t.project_id,
        project_name: projectNameForTask(t),
        assignee: getTaskAssigneeName(t),
        phase_name: phaseLabelForTask(t),
      })),
  ).slice(0, 10);

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
  ).slice(0, 10);

  const totalTaskCount = scoped.length;
  const completedTaskCount = scoped.filter((t) => t?.completed).length;
  const keepOriginalCompletionDate = reportSections?.keep_original_completion_date !== false;

  const scheduleTimeline = project
    ? computeProjectScheduleTimeline(
        projectPhases,
        resolveReportScheduleDueDate(project, keepOriginalCompletionDate),
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
      project_end_date: resolveReportProjectEndDate({
        project,
        tasks: scoped,
        keepOriginalCompletionDate,
      }),
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
    schedule_adjustments: scheduleAdjustmentsForProject || [],
    last_week_done: lastWeekDone,
    this_week_plan: thisWeekPlan,
    next_week_plan: nextWeekPlan,
  };
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
  const [previewScheduleAdjustments, setPreviewScheduleAdjustments] = useState([]);
  const [previewDailySiteLogs, setPreviewDailySiteLogs] = useState([]);
  const [previewStatusChanges, setPreviewStatusChanges] = useState([]);
  const [previewBlockers, setPreviewBlockers] = useState([]);
  const [previewPmActions, setPreviewPmActions] = useState(null);
  const [orgBranding, setOrgBranding] = useState({
    logo_url: null,
    primary_color: '#3B82F6',
    secondary_color: '#10B981',
    company_footer: '',
    email_signature: '',
  });
  const [emailHtml, setEmailHtml] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [isBuildingHtml, setIsBuildingHtml] = useState(false);
  const iframeRef = useRef(null);

  const previewMode = formData?.report_audience_type === 'executive' ? 'executive' : 'standard';
  const showScheduleAdjustments = formData?.report_sections?.show_schedule_adjustments === true;

  useEffect(() => {
    const orgId = state.currentOrganization?.id;
    if (!orgId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const branding = await getOrganizationBranding(supabaseClient, orgId);
        if (cancelled) return;
        setOrgBranding({
          logo_url: branding?.logo_url || null,
          primary_color: branding?.primary_color || '#3B82F6',
          secondary_color: branding?.secondary_color || '#10B981',
          company_footer: branding?.company_footer || '',
          email_signature: branding?.email_signature || '',
          organization_name: state.currentOrganization?.name || '',
        });
      } catch {
        if (!cancelled) {
          setOrgBranding((prev) => ({
            ...prev,
            organization_name: state.currentOrganization?.name || '',
          }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [state.currentOrganization?.id, state.currentOrganization?.name]);

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
    if (!showScheduleAdjustments) {
      setPreviewScheduleAdjustments([]);
      return undefined;
    }
    const pid = effectiveProjectId;
    const ids = effectiveIncludedProjectIds;
    if (pid) {
      const ac = new AbortController();
      (async () => {
        try {
          const rows = await listScheduleAdjustmentsForProject(
            supabaseClient,
            pid,
            { status: 'applied' },
          );
          if (ac.signal.aborted) return;
          setPreviewScheduleAdjustments(rows || []);
        } catch {
          if (ac.signal.aborted) return;
          setPreviewScheduleAdjustments([]);
        }
      })();
      return () => ac.abort();
    }
    if (!ids.length || !state.currentOrganization?.id) {
      setPreviewScheduleAdjustments([]);
      return undefined;
    }
    const ac = new AbortController();
    (async () => {
      const { data, error } = await supabaseClient
        .from('schedule_adjustments')
        .select('*, projects!schedule_adjustments_project_id_fkey(name)')
        .eq('organization_id', state.currentOrganization.id)
        .eq('status', 'applied')
        .in('project_id', ids)
        .order('applied_at', { ascending: false });
      if (ac.signal.aborted) return;
      setPreviewScheduleAdjustments(error ? [] : data || []);
    })();
    return () => ac.abort();
  }, [showScheduleAdjustments, effectiveProjectId, effectiveIncludedProjectIds, state.currentOrganization?.id]);

  const includeDailySiteLogs = formData?.report_sections?.include_daily_site_logs === true;
  const showBlockers = formData?.report_sections?.show_blockers === true;

  React.useEffect(() => {
    if (!includeDailySiteLogs) {
      setPreviewDailySiteLogs([]);
      return undefined;
    }
    const orgId = state.currentOrganization?.id;
    const pid = effectiveProjectId;
    const ids = pid ? [pid] : effectiveIncludedProjectIds;
    if (!orgId || !ids.length) {
      setPreviewDailySiteLogs([]);
      return undefined;
    }
    const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date().toISOString();
    const ac = new AbortController();
    (async () => {
      const { data, error } = await supabaseClient
        .from('project_stream_posts')
        .select('id, project_id, title, body, payload, file_url, file_name, created_at, projects!project_stream_posts_project_id_fkey(name)')
        .eq('organization_id', orgId)
        .eq('post_type', 'daily_log')
        .in('project_id', ids)
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd)
        .order('created_at', { ascending: true });
      if (ac.signal.aborted) return;
      if (error) {
        setPreviewDailySiteLogs([]);
        return;
      }
      setPreviewDailySiteLogs(
        (data || []).map((row) => ({
          id: row.id,
          project_id: row.project_id,
          project_name: row.projects?.name || null,
          title: row.title,
          body: row.body,
          payload: row.payload,
          file_url: row.file_url || null,
          file_name: row.file_name || null,
          created_at: row.created_at,
        })),
      );
    })();
    return () => ac.abort();
  }, [includeDailySiteLogs, effectiveProjectId, effectiveIncludedProjectIds, state.currentOrganization?.id]);

  React.useEffect(() => {
    const orgId = state.currentOrganization?.id;
    const pid = effectiveProjectId;
    const ids = pid ? [pid] : effectiveIncludedProjectIds;
    if (!orgId || !ids.length) {
      setPreviewStatusChanges([]);
      return undefined;
    }
    const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date().toISOString();
    const ac = new AbortController();
    (async () => {
      let q = supabaseClient
        .from('activity_log')
        .select('id, project_id, entity_type, entity_name, action, details, created_at, user_name')
        .eq('organization_id', orgId)
        .eq('entity_type', 'project')
        .eq('action', 'updated')
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd)
        .order('created_at', { ascending: false })
        .limit(20);
      if (pid) q = q.eq('project_id', pid);
      else q = q.in('project_id', ids);
      const { data, error } = await q;
      if (ac.signal.aborted) return;
      if (error) {
        setPreviewStatusChanges([]);
        return;
      }
      const changes = [];
      for (const activity of data || []) {
        let det = activity.details;
        if (typeof det === 'string') {
          try { det = JSON.parse(det); } catch { det = {}; }
        }
        det = det && typeof det === 'object' ? det : {};
        if (det.status == null && det.new_status == null) continue;
        changes.push({
          project_id: activity.project_id,
          project_name: activity.entity_name || 'Project',
          old_status: det.old_status || det.previous_status || '',
          new_status: det.new_status || det.status || '',
          changed_by: activity.user_name || null,
          changed_at: activity.created_at,
        });
      }
      setPreviewStatusChanges(changes);
    })();
    return () => ac.abort();
  }, [effectiveProjectId, effectiveIncludedProjectIds, state.currentOrganization?.id]);

  React.useEffect(() => {
    if (!showBlockers) {
      setPreviewBlockers([]);
      return undefined;
    }
    const orgId = state.currentOrganization?.id;
    const pid = effectiveProjectId;
    const ids = pid ? [pid] : effectiveIncludedProjectIds;
    if (!orgId || !ids.length) {
      setPreviewBlockers([]);
      return undefined;
    }
    const ac = new AbortController();
    (async () => {
      let q = supabaseClient
        .from('project_issues')
        .select('id, title, status, project_id, resolved_at')
        .eq('organization_id', orgId)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(12);
      if (pid) q = q.eq('project_id', pid);
      else q = q.in('project_id', ids);
      const { data, error } = await q;
      if (ac.signal.aborted) return;
      if (error) {
        setPreviewBlockers([]);
        return;
      }
      setPreviewBlockers((data || []).map((row) => row.title || 'Issue').filter(Boolean));
    })();
    return () => ac.abort();
  }, [showBlockers, effectiveProjectId, effectiveIncludedProjectIds, state.currentOrganization?.id]);

  React.useEffect(() => {
    const orgId = state.currentOrganization?.id;
    const pid = effectiveProjectId;
    const ids = pid ? [pid] : effectiveIncludedProjectIds;
    const includePm = formData?.report_sections?.pm_actions !== false;
    if (!includePm || !orgId || !ids.length) {
      setPreviewPmActions(null);
      return undefined;
    }
    // Match generate-progress-report default window (min 7 days ending now).
    const endMs = Date.now();
    const startMs = endMs - 7 * 24 * 60 * 60 * 1000;
    const periodStart = new Date(startMs).toISOString().slice(0, 10);
    const periodEnd = new Date(endMs).toISOString().slice(0, 10);
    const ac = new AbortController();
    (async () => {
      try {
        const rows = await listPmActionsInWindow(supabaseClient, {
          projectIds: ids,
          startDate: periodStart,
          endDate: periodEnd,
          organizationId: orgId,
        });
        if (ac.signal.aborted) return;
        setPreviewPmActions(mergePmActionsNotes(rows));
      } catch {
        if (!ac.signal.aborted) setPreviewPmActions(null);
      }
    })();
    return () => ac.abort();
  }, [
    effectiveProjectId,
    effectiveIncludedProjectIds,
    state.currentOrganization?.id,
    formData?.report_sections?.pm_actions,
  ]);

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
  const showTaskPhotos = includeTaskPhotosInReport;
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
                .slice(0, 3)
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
      .slice(0, 10);
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
      .slice(0, 10)
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
      .filter((t) => taskOverlapsPreviewWindow(t, todayDay, thisWeekEnd))
      .map((t) => ({
        text: t.text,
        start_date: t.start_date || null,
        project_id: t.project_id,
        project_name: projectNameForTask(t),
        assignee: getTaskAssigneeName(t),
        phase_name: phaseLabelForTask(t),
      })),
  ).slice(0, 10);

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
  ).slice(0, 10);

  const totalTaskCount = scopedTasks.length;
  const completedTaskCount = scopedTasks.filter((t) => t?.completed).length;
  const keepOriginalCompletionDate = reportSections.keep_original_completion_date !== false;

  const scheduleTimeline = selectedProject
    ? computeProjectScheduleTimeline(
        previewPhases,
        resolveReportScheduleDueDate(selectedProject, keepOriginalCompletionDate),
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

  const scheduleAdjustmentFallsInPreviewWindow = (row) => {
    const ts = row?.applied_at || row?.created_at;
    if (!ts) return false;
    const d = new Date(ts).getTime();
    if (Number.isNaN(d)) return false;
    return d >= periodStart.getTime() && d <= now.getTime();
  };

  const scheduleAdjustmentsInWindow = (previewScheduleAdjustments || [])
    .filter((row) => scheduleAdjustmentFallsInPreviewWindow(row))
    .map((row) => ({
      id: row.id,
      project_id: row.project_id,
      note: row.note,
      applied_workdays: row.applied_workdays,
      planned_finish: row.planned_finish,
      actual_finish: row.actual_finish,
      applied_at: row.applied_at,
      created_at: row.created_at,
      project_name:
        row.projects?.name
        || projectNameForTask(row)
        || projectName
        || t('progressReports.builder.untitled_project'),
    }));

  const orgProjectPreviewSlices = React.useMemo(() => {
    if (selectedProject) return null;
    return effectiveIncludedProjectIds.map((pid) => {
      const project = projects.find((p) => String(p.id) === String(pid));
      const projectTasks = scopedTasks.filter((t) => String(t.project_id) === String(pid));
      const projectPhases = (previewPhases || []).filter((p) => String(p.project_id) === String(pid));
      const weatherFor = (weatherImpactsInWindow || []).filter((w) => String(w.project_id) === String(pid));
      const scheduleFor = (scheduleAdjustmentsInWindow || []).filter((w) => String(w.project_id) === String(pid));
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
          scheduleAdjustmentsForProject: scheduleFor,
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
    scheduleAdjustmentsInWindow,
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
    schedule_adjustments: reportSections.show_schedule_adjustments ? scheduleAdjustmentsInWindow : [],
    vitals: {
      tasks_completed_count: completedTaskCount,
      open_tasks_count: Math.max(0, totalTaskCount - completedTaskCount),
      project_end_date: resolveReportProjectEndDate({
        project: selectedProject,
        tasks: scopedTasks,
        keepOriginalCompletionDate,
      }),
      ...(scheduleVitals ? { ...scheduleVitals } : {}),
    },
    last_week_done: lastWeekDone,
    this_week_plan: thisWeekPlan,
    next_week_plan: nextWeekPlan,
    status_changes: previewStatusChanges,
    completed_tasks: completedTasks,
    phase_progress: phaseProgressPreview,
    daily_site_logs: includeDailySiteLogs ? previewDailySiteLogs : [],
    blockers: showBlockers ? previewBlockers : [],
    pm_actions: reportSections.pm_actions !== false ? previewPmActions : null,
    snapshot_open_tasks: scopedTasks
      .filter((t) => !t?.completed)
      .slice(0, 10)
      .map((t) => ({
        text: t.text,
        phase_name: phaseLabelForTask(t),
        due_date: t.due_date || null,
      })),
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
      const saCount = (data.schedule_adjustments || []).length;
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
      if (saCount > 0) {
        parts.push(
          p(saCount === 1 ? 'schedule_records_one' : 'schedule_records_other', { count: saCount }),
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
      if (saCount > 0) {
        highlights.push({ type: 'schedule_adjustments', count: saCount });
      }

      return {
        organization_name: data.organization_name,
        project_name: data.project_name,
        start_date: data.start_date,
        end_date: data.end_date,
        executive_summary,
        at_a_glance: atAGlance,
        key_highlights: highlights.slice(0, 5),
        weather_impacts: data.weather_impacts,
        schedule_adjustments: data.schedule_adjustments,
        pm_actions: data.pm_actions,
      };
    }
    // standard — return all data; template flags control what to render
    return data;
  };

  const previewData = getPreviewData(baseData, previewMode);

  useEffect(() => {
    setIsBuildingHtml(true);
    const timer = setTimeout(() => {
      try {
        const { schedule, branding, reportData } = buildPreviewEmailPayload({
          previewData,
          formData,
          branding: orgBranding,
          previewMode,
          orgProjectPreviewSlices,
          selectedProject,
          p,
          t,
        });
        const generated = previewMode === 'executive'
          ? generateExecutiveReportEmail(reportData, schedule, branding)
          : generateStandardReportEmail(reportData, schedule, branding);
        setEmailHtml(generated.html || '');
        setEmailSubject(generated.subject || '');
      } catch (err) {
        console.error('Progress report preview HTML build failed', err);
        setEmailHtml('');
      } finally {
        setIsBuildingHtml(false);
      }
    }, 200);
    return () => clearTimeout(timer);
    // previewData is rebuilt each render; depend on the inputs that feed it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData,
    previewMode,
    orgBranding,
    orgProjectPreviewSlices,
    selectedProject,
    previewData.organization_name,
    previewData.project_name,
    previewData.start_date,
    previewData.end_date,
    previewData.executive_summary,
    previewData.at_a_glance,
    previewData.key_highlights,
    previewData.vitals,
    previewData.status_changes,
    previewData.completed_tasks,
    previewData.phase_progress,
    previewData.last_week_done,
    previewData.this_week_plan,
    previewData.next_week_plan,
    previewData.weather_impacts,
    previewData.schedule_adjustments,
    previewData.daily_site_logs,
    previewData.blockers,
    previewData.pm_actions,
    t,
    i18n?.language,
  ]);

  const resizeIframe = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc?.body) return;
      const height = Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight || 0, 240);
      iframe.style.height = `${height}px`;
    } catch {
      // cross-origin / sandbox edge cases — leave default height
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
  const subjectDisplay = formData.custom_subject || emailSubject || (
    previewMode === 'executive'
      ? p('brief_subject', { name: previewData.organization_name || t('navigation.organization') })
      : p('progress_subject', {
        name: previewData.project_name || previewData.organization_name || p('your_project'),
      })
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900 min-w-0">
          {p('preview_title')}:{' '}
          <span className="font-semibold text-gray-700">
            {previewMode === 'executive' ? p('mode_brief') : p('mode_standard')}
          </span>
        </p>

        {scheduleId && (
          <button
            type="button"
            onClick={handleSendTest}
            disabled={isSendingTest}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 btn-smooth"
          >
            {isSendingTest ? (
              <>
                <LoadingSpinner size="sm" text="" />
                {p('sending_test')}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {p('send_test')}
              </>
            )}
          </button>
        )}
      </div>

      <div className="border border-gray-300 rounded-lg overflow-hidden bg-[#e8eaed] shadow-inner">
        <div className="bg-white border-b border-gray-200 px-3 py-2.5">
          {[
            { label: p('email_from'), value: fromDisplay },
            { label: p('email_to'), value: toDisplay },
            { label: p('email_date'), value: dateDisplay },
            { label: p('email_subject'), value: subjectDisplay, bold: true },
          ].map(({ label, value, bold }) => (
            <div key={label} className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700 mt-1 first:mt-0">
              <span className="shrink-0 font-medium text-gray-500 w-14">{label}</span>
              <span className={`min-w-0 break-all ${bold ? 'font-semibold text-gray-900' : ''}`}>{value}</span>
            </div>
          ))}
        </div>

        <div className="bg-[#fafafa] min-h-[240px] relative">
          {isBuildingHtml && !emailHtml ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-500">
              {p('preview_loading_html')}
            </div>
          ) : null}
          {emailHtml ? (
            <iframe
              ref={iframeRef}
              title={p('preview_title')}
              srcDoc={emailHtml}
              sandbox="allow-same-origin"
              onLoad={resizeIframe}
              className="w-full border-0 bg-white block"
              style={{ minHeight: 240 }}
            />
          ) : !isBuildingHtml ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-500">
              {p('preview_loading_html')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default ProgressReportPreview;
