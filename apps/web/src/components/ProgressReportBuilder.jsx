import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext, supabaseClient } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import ProgressReportRecipientsField from './ProgressReportRecipientsField';
import ProgressReportPreview from './ProgressReportPreview';
import BrandingSettings from './BrandingSettings';
import LoadingSpinner from './LoadingSpinner';
import {
  createProgressReportSchedule,
  updateProgressReportSchedule,
  updateRecipients,
  formatSendHourLabel,
  formatTimezoneLabel,
} from '@siteweave/core-logic';

const TIMEZONE_DEFS = [
  { value: 'America/New_York', labelKey: 'timezone_eastern' },
  { value: 'America/Chicago', labelKey: 'timezone_central' },
  { value: 'America/Denver', labelKey: 'timezone_mountain' },
  { value: 'America/Los_Angeles', labelKey: 'timezone_pacific' },
  { value: 'America/Anchorage', labelKey: 'timezone_alaska' },
  { value: 'Pacific/Honolulu', labelKey: 'timezone_hawaii' },
];

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

const DAY_I18N_KEYS = [
  'day_sunday',
  'day_monday',
  'day_tuesday',
  'day_wednesday',
  'day_thursday',
  'day_friday',
  'day_saturday',
];

const FREQUENCY_DEFS = [
  { value: 'manual', labelKey: 'frequency_manual' },
  { value: 'weekly', labelKey: 'frequency_weekly' },
  { value: 'bi-weekly', labelKey: 'frequency_biweekly' },
  { value: 'monthly', labelKey: 'frequency_monthly' },
];

const MONTHLY_DEFS = [
  { value: 1, labelKey: 'monthly_1st' },
  { value: 15, labelKey: 'monthly_15th' },
  { value: -1, labelKey: 'monthly_last' },
];

const REPORT_TYPE_DEFS = [
  { value: 'standard', labelKey: 'type_standard', descKey: 'type_standard_desc' },
  { value: 'executive', labelKey: 'type_executive', descKey: 'type_executive_desc' },
];

const SECTION_DEFS = [
  { key: 'status_changes', labelKey: 'section_status_changes' },
  { key: 'task_completion', labelKey: 'section_task_completion' },
  { key: 'phase_changes', labelKey: 'section_phase_changes' },
  { key: 'vitals', labelKey: 'section_vitals' },
  { key: 'weekly_plan', labelKey: 'section_weekly_plan' },
];

const DETAIL_TOGGLE_DEFS = [
  { key: 'show_assignees', labelKey: 'toggle_assignees', default: false },
  { key: 'show_dates', labelKey: 'toggle_dates', default: false },
  { key: 'show_who_changed', labelKey: 'toggle_who_changed', default: false },
  { key: 'show_phase_delta', labelKey: 'toggle_phase_delta', default: false },
  { key: 'show_task_phase', labelKey: 'toggle_task_phase', default: false },
  { key: 'show_blockers', labelKey: 'toggle_blockers', default: false },
  { key: 'show_weather_impacts', labelKey: 'toggle_weather', default: true },
  { key: 'show_schedule_adjustments', labelKey: 'toggle_schedule_adjustments', hintKey: 'toggle_schedule_adjustments_hint', default: false },
  { key: 'keep_original_completion_date', labelKey: 'toggle_keep_original_completion_date', hintKey: 'toggle_keep_original_completion_date_hint', default: true },
  { key: 'include_task_photos', labelKey: 'toggle_photos', default: false },
  { key: 'include_daily_site_logs', labelKey: 'toggle_daily_site_logs', default: false },
  { key: 'client_friendly_labels', labelKey: 'toggle_friendly_labels', default: true },
];

const DEFAULT_SECTIONS = {
  status_changes: true,
  task_completion: true,
  phase_changes: true,
  vitals: true,
  weekly_plan: true,
  show_assignees: false,
  show_dates: false,
  show_who_changed: false,
  show_phase_delta: false,
  show_task_phase: false,
  show_blockers: false,
  show_weather_impacts: true,
  show_schedule_adjustments: false,
  keep_original_completion_date: true,
  include_task_photos: false,
  include_daily_site_logs: false,
  client_friendly_labels: true,
};

const builderKey = (suffix) => `progressReports.builder.${suffix}`;

/**
 * Progress Report Builder — single-page form with live preview.
 * Two report types: Standard (customisable detail level) and Brief.
 */
function ProgressReportBuilder({
  scheduleId = null,
  projectId = null,
  organizationId = null,
  onSave,
  onCancel,
}) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const projects = state.projects || [];
  const { addToast } = useToast();
  const [showBranding, setShowBranding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const recipientsFieldRef = useRef(null);
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);

  const sendHourOptions = useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => ({
        value: hour,
        label: formatSendHourLabel(hour),
      })),
    []
  );

  const timezoneOptions = useMemo(() => {
    const base = TIMEZONE_DEFS.map(({ value, labelKey }) => ({
      value,
      label: t(builderKey(labelKey)),
    }));
    if (!base.some((opt) => opt.value === browserTimezone)) {
      base.unshift({
        value: browserTimezone,
        label: t(builderKey('timezone_local'), { zone: browserTimezone }),
      });
    }
    return base;
  }, [t, browserTimezone]);

  const dayNames = useMemo(
    () => DAY_I18N_KEYS.map((key) => t(builderKey(key))),
    [t]
  );

  const frequencyOptions = useMemo(
    () =>
      FREQUENCY_DEFS.map(({ value, labelKey }) => ({
        value,
        label: t(builderKey(labelKey)),
      })),
    [t]
  );

  const monthlyOptions = useMemo(
    () =>
      MONTHLY_DEFS.map(({ value, labelKey }) => ({
        value,
        label: t(builderKey(labelKey)),
      })),
    [t]
  );

  const reportTypes = useMemo(
    () =>
      REPORT_TYPE_DEFS.map(({ value, labelKey, descKey }) => ({
        value,
        label: t(builderKey(labelKey)),
        description: t(builderKey(descKey)),
      })),
    [t]
  );

  const sectionOptions = useMemo(
    () =>
      SECTION_DEFS.map(({ key, labelKey }) => ({
        key,
        label: t(builderKey(labelKey)),
      })),
    [t]
  );

  const detailToggles = useMemo(
    () =>
      DETAIL_TOGGLE_DEFS.map(({ key, labelKey, hintKey, default: defaultOn }) => ({
        key,
        label: t(builderKey(labelKey)),
        hint: hintKey ? t(builderKey(hintKey)) : null,
        default: defaultOn,
      })),
    [t]
  );

  const [formData, setFormData] = useState({
    name: '',
    report_audience_type: 'standard',
    template_type: 'client_standard',
    frequency: 'manual',
    frequency_value: null,
    custom_subject: '',
    custom_message: '',
    project_id: projectId || null,
    included_project_ids: [],
    report_sections: { ...DEFAULT_SECTIONS },
    requires_approval: false,
    include_branding: true,
    is_active: false,
    send_hour: 8,
    send_timezone: browserTimezone,
  });


  const defaultReportNameSuffix = useMemo(() => {
    if (!projectId || !projects.length) return null;
    return projects.find((p) => p.id === projectId)?.name || 'Project';
  }, [projectId, projects]);

  const sortedProjectsForOrg = useMemo(
    () => [...projects].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [projects]
  );

  useEffect(() => {
    if (scheduleId || projectId) return;
    if (!projects.length) return;
    setFormData((prev) => {
      if (prev.included_project_ids?.length) return prev;
      return { ...prev, included_project_ids: projects.map((p) => p.id) };
    });
  }, [scheduleId, projectId, projects]);

  useEffect(() => {
    if (!scheduleId) return;
    loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId]);

  useEffect(() => {
    if (scheduleId) return;
    if (projectId && defaultReportNameSuffix) {
      setFormData((prev) => ({
        ...prev,
        name: t(builderKey('default_report_name'), { project: defaultReportNameSuffix }),
      }));
    }
  }, [scheduleId, projectId, defaultReportNameSuffix, t]);

  useEffect(() => {
    if (scheduleId) return;
    setFormData((prev) => ({ ...prev, project_id: projectId || null }));
  }, [projectId, scheduleId]);

  useEffect(() => {
    if (scheduleId) return;
    const orgId = organizationId || state.currentOrganization?.id;
    if (!orgId) return;
    const loadDefaultTimezone = async () => {
      const { data } = await supabaseClient
        .from('organizations')
        .select('progress_report_timezone')
        .eq('id', orgId)
        .maybeSingle();
      const tz =
        typeof data?.progress_report_timezone === 'string' && data.progress_report_timezone
          ? data.progress_report_timezone
          : browserTimezone;
      setFormData((prev) => ({
        ...prev,
        send_timezone: prev.send_timezone || tz,
      }));
    };
    loadDefaultTimezone();
  }, [scheduleId, organizationId, state.currentOrganization?.id, browserTimezone]);

  const loadSchedule = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from('progress_report_schedules')
        .select('*, progress_report_recipients(*)')
        .eq('id', scheduleId)
        .single();

      if (error) throw error;

      // Map legacy audience values to the new two-option model.
      // 'internal' schedules get all detail toggles turned on so they look the same.
      const isLegacyInternal = data.report_audience_type === 'internal';
      const mappedAudience = data.report_audience_type === 'executive' ? 'executive' : 'standard';
      const base = data.report_sections || {};
      const legacyWeeklyPlanValue = base.weekly_plan ?? base.lookahead;
      const sections = isLegacyInternal
        ? {
            ...DEFAULT_SECTIONS,
            ...base,
            weekly_plan: legacyWeeklyPlanValue !== false,
            show_assignees:         base.show_assignees         ?? true,
            show_dates:             base.show_dates             ?? true,
            show_who_changed:       base.show_who_changed       ?? true,
            show_phase_delta:       base.show_phase_delta       ?? true,
            show_task_phase:        base.show_task_phase        ?? true,
            show_blockers:          base.show_blockers          ?? true,
            show_weather_impacts:   base.show_weather_impacts   ?? true,
            show_schedule_adjustments: base.show_schedule_adjustments ?? false,
            keep_original_completion_date: base.keep_original_completion_date ?? true,
            include_task_photos:    base.include_task_photos    ?? true,
            client_friendly_labels: base.client_friendly_labels ?? false,
          }
        : {
            ...DEFAULT_SECTIONS,
            ...base,
            weekly_plan: legacyWeeklyPlanValue !== false,
          };

      const allProjIds = projects.map((p) => p.id);
      const rawIncluded = data.included_project_ids;
      let includedProjIds =
        Array.isArray(rawIncluded) && rawIncluded.length > 0
          ? rawIncluded.filter((id) => allProjIds.includes(id))
          : allProjIds;

      setFormData({
        name: data.name,
        report_audience_type: mappedAudience,
        template_type: data.template_type || 'client_standard',
        frequency: data.frequency || 'manual',
        frequency_value: data.frequency_value ?? null,
        custom_subject: data.custom_subject || '',
        custom_message: data.custom_message || '',
        project_id: data.project_id ?? projectId ?? null,
        included_project_ids: data.project_id ? [] : includedProjIds,
        report_sections: sections,
        requires_approval: false,
        include_branding: data.include_branding !== false,
        is_active: data.is_active || false,
        send_hour: Number.isFinite(Number(data.send_hour)) ? Number(data.send_hour) : 8,
        send_timezone:
          typeof data.send_timezone === 'string' && data.send_timezone
            ? data.send_timezone
            : browserTimezone,
      });

      const recs = data.progress_report_recipients || [];
      const contactsById = new Map((state.contacts || []).map((c) => [c.id, c]));
      setRecipients(
        recs
          .map((r) => {
            const contact = r.contact_id ? contactsById.get(r.contact_id) : null;
            return {
              contact_id: r.contact_id ?? undefined,
              email: r.email,
              name: contact?.name,
              contact_type: contact?.type,
              recipient_type: r.recipient_type || 'to',
            };
          })
          .filter((r) => r.email),
      );
    } catch (error) {
      addToast(t(builderKey('load_schedule_error'), { message: error.message }), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (activate = false) => {
    if (!formData.name) {
      addToast(t(builderKey('enter_report_name')), 'error');
      return;
    }
    const activeRecipients = recipientsFieldRef.current?.flush?.() ?? recipients;
    if (activeRecipients.length === 0) {
      addToast(t(builderKey('add_recipient')), 'error');
      return;
    }
    if (!projectId && (!formData.included_project_ids || formData.included_project_ids.length === 0)) {
      addToast(t(builderKey('select_project')), 'error');
      return;
    }

    setIsSaving(true);
    try {
      const orgId = organizationId || state.currentOrganization?.id;
      if (!orgId) throw new Error('Organization ID required');

      // Save standard audience as 'client' for edge-function backward compat
      const dbAudience = formData.report_audience_type === 'executive' ? 'executive' : 'client';
      const templateType = formData.report_audience_type === 'executive' ? 'executive_summary' : 'client_standard';

      const allProjIds = projects.map((p) => p.id);
      const sel = formData.included_project_ids || [];
      const included_project_ids = !projectId
        ? sel.length === allProjIds.length && allProjIds.every((id) => sel.includes(id))
          ? null
          : sel
        : null;

      const scheduleData = {
        ...formData,
        report_audience_type: dbAudience,
        template_type: templateType,
        organization_id: orgId,
        project_id: projectId,
        included_project_ids,
        is_active: activate,
        created_by_user_id: state.user.id,
        requires_approval: false,
      };

      let savedSchedule;
      if (scheduleId) {
        savedSchedule = await updateProgressReportSchedule(supabaseClient, scheduleId, scheduleData);
      } else {
        savedSchedule = await createProgressReportSchedule(supabaseClient, scheduleData);
      }

      await updateRecipients(supabaseClient, savedSchedule.id, activeRecipients);

      addToast(
        activate ? t(builderKey('schedule_activated')) : t(builderKey('schedule_saved')),
        'success'
      );
      if (onSave) onSave(savedSchedule);
    } catch (error) {
      addToast(t(builderKey('save_schedule_error'), { message: error.message }), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const updateSection = (key, value) =>
    setFormData((prev) => ({
      ...prev,
      report_sections: { ...prev.report_sections, [key]: value },
    }));

  const isStandard = formData.report_audience_type === 'standard';
  const frequency = formData.frequency || 'manual';
  const frequencyValue = formData.frequency_value;
  const needsDayOfWeek = frequency === 'weekly' || frequency === 'bi-weekly';
  const needsMonthlyDay = frequency === 'monthly';
  const dayValue = frequencyValue != null && frequencyValue >= 0 && frequencyValue <= 6 ? frequencyValue : 1;
  const monthlyValue = frequency === 'monthly' ? (frequencyValue === 15 ? 15 : frequencyValue === -1 || frequencyValue === 31 ? -1 : 1) : 1;
  const sendHour = Number.isFinite(Number(formData.send_hour)) ? Number(formData.send_hour) : 8;
  const sendTimezone = formData.send_timezone || browserTimezone;
  const sendTimeSummary =
    frequency !== 'manual'
      ? t(builderKey(needsMonthlyDay ? 'send_time_summary_monthly' : 'send_time_summary'), {
          time: formatSendHourLabel(sendHour),
          timezone: formatTimezoneLabel(sendTimezone),
        })
      : null;

  if (isLoading) {
    return <LoadingSpinner text={t(builderKey('loading_schedule'))} />;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* ── Left column: form ── */}
      <div className="flex-1 space-y-4">

        {/* Card 1: Report setup */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">{t(builderKey('report_setup'))}</h2>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t(builderKey('report_name'))}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              placeholder={t(builderKey('report_name_placeholder'))}
            />
          </div>

          {/* Report type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t(builderKey('report_type'))}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {reportTypes.map((opt) => {
                const selected = formData.report_audience_type === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, report_audience_type: opt.value })}
                    className={`text-left p-3 rounded-lg border-2 transition-colors ${
                      selected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <p className={`text-sm font-semibold ${selected ? 'text-blue-800' : 'text-gray-800'}`}>
                      {opt.label}
                    </p>
                    <p className={`text-xs mt-0.5 leading-snug ${selected ? 'text-blue-600' : 'text-gray-500'}`}>
                      {opt.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {!projectId && projects.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t(builderKey('projects_in_report'))}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-600">
                    {t(builderKey('selected_count'), {
                      selected: (formData.included_project_ids || []).length,
                      total: projects.length,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        included_project_ids: projects.map((p) => p.id),
                      }))
                    }
                    className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100"
                  >
                    {t(builderKey('select_all'))}
                  </button>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {sortedProjectsForOrg.map((p) => {
                  const checked = (formData.included_project_ids || []).includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 cursor-pointer text-sm text-gray-800"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setFormData((prev) => {
                            const cur = prev.included_project_ids || [];
                            if (checked && cur.length <= 1) {
                              return prev;
                            }
                            const next = checked
                              ? cur.filter((id) => id !== p.id)
                              : [...cur, p.id];
                            return { ...prev, included_project_ids: next };
                          });
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="truncate">{p.name || t(builderKey('untitled_project'))}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <ProgressReportRecipientsField
            ref={recipientsFieldRef}
            recipients={recipients}
            onChange={setRecipients}
            projectId={projectId}
          />

          {/* Schedule */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">{t(builderKey('schedule'))}</label>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="min-w-[140px]">
                <select
                  value={frequency}
                  onChange={(e) => {
                    const f = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      frequency: f,
                      frequency_value:
                        f === 'weekly' || f === 'bi-weekly'
                          ? prev.frequency_value != null && prev.frequency_value <= 6 ? prev.frequency_value : 1
                          : f === 'monthly'
                          ? (prev.frequency_value === 15 ? 15 : prev.frequency_value === -1 || prev.frequency_value === 31 ? -1 : 1)
                          : null,
                    }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  {frequencyOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {needsDayOfWeek && (
                <div className="min-w-[140px]">
                  <select
                    value={dayValue}
                    onChange={(e) => setFormData({ ...formData, frequency_value: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    {dayNames.map((day, i) => (
                      <option key={i} value={i}>{day}</option>
                    ))}
                  </select>
                </div>
              )}
              {needsMonthlyDay && (
                <div className="min-w-[160px]">
                  <label className="block text-xs text-gray-500 mb-1">{t(builderKey('date_each_month'))}</label>
                  <select
                    value={monthlyValue}
                    onChange={(e) => setFormData({ ...formData, frequency_value: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    {monthlyOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {frequency !== 'manual' && (
              <div className="flex flex-wrap gap-3 items-end pt-1">
                <div className="min-w-[140px]">
                  <label className="block text-xs text-gray-500 mb-1">{t(builderKey('send_time_label'))}</label>
                  <select
                    value={sendHour}
                    onChange={(e) =>
                      setFormData({ ...formData, send_hour: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    {sendHourOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[180px]">
                  <label className="block text-xs text-gray-500 mb-1">{t(builderKey('send_timezone_label'))}</label>
                  <select
                    value={sendTimezone}
                    onChange={(e) => setFormData({ ...formData, send_timezone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    {timezoneOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {sendTimeSummary && (
              <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5">
                {sendTimeSummary}
              </p>
            )}
          </div>

          {projectId && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">{t(builderKey('scoped_to_project'))}</p>
            </div>
          )}
        </div>

        {/* Card 2: Email content */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">{t(builderKey('email_content'))}</h2>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t(builderKey('subject_line'))}</label>
            <input
              type="text"
              value={formData.custom_subject}
              onChange={(e) => setFormData({ ...formData, custom_subject: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              placeholder={t(builderKey('subject_placeholder'))}
            />
          </div>

          {/* Personal message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t(builderKey('personal_message'))}</label>
            <textarea
              value={formData.custom_message}
              onChange={(e) => setFormData({ ...formData, custom_message: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              placeholder={t(builderKey('message_placeholder'))}
            />
          </div>

          {/* Sections & detail level — standard only */}
          {isStandard && (
            <>
              <div className="border-t border-gray-100 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t(builderKey('sections_to_include'))}</label>
                <div className="space-y-2">
                  {sectionOptions.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.report_sections[key] !== false}
                        onChange={(e) => updateSection(key, e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm font-medium text-gray-700 mb-1">{t(builderKey('detail_level'))}</p>
                <p className="text-xs text-gray-400 mb-3">
                  {t(builderKey('detail_level_hint'))}
                </p>
                <div className="space-y-3">
                  {detailToggles.map(({ key, label, hint }) => (
                    <label key={key} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!formData.report_sections[key]}
                        onChange={(e) => updateSection(key, e.target.checked)}
                        className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-gray-700">{label}</span>
                        {hint ? (
                          <span className="mt-0.5 block text-xs text-gray-500 leading-snug">{hint}</span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Email appearance accordion */}
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowBranding((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <span>{t(builderKey('email_appearance'))}</span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${showBranding ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showBranding && (
            <div className="border-t border-gray-200 bg-white px-4 py-4">
              <p className="text-xs text-gray-500 mb-4">
                {t(builderKey('branding_hint_strong'))}
              </p>
              <BrandingSettings compact />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex justify-between items-center">
          <div>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {isSaving ? t('common.saving_ellipsis') : t('common.save')}
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={isSaving}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {isSaving ? t('common.saving_ellipsis') : t(builderKey('save_and_activate'))}
            </button>
          </div>
        </div>
      </div>

      {/* ── Right column: preview ── */}
      <div className="w-full lg:w-[min(480px,40vw)] flex-shrink-0">
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 sticky top-4">
          <ProgressReportPreview
            formData={formData}
            projectId={projectId}
            recipients={recipients}
            scheduleId={scheduleId}
          />
        </div>
      </div>
    </div>
  );
}

export default ProgressReportBuilder;
