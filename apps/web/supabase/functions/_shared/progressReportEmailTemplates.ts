// AUTO-GENERATED from src/utils/progressReportEmailTemplates.js — run: node scripts/sync-progress-report-templates.mjs
// deno-lint-ignore-file no-explicit-any

/**
 * Progress Report Email Templates
 * Generates HTML email templates for different audience types.
 *
 * Design principles: excellent typography, generous whitespace, deterministic
 * copy (no AI for narrative). Zero heavy animations.
 *
 * Edge functions use a generated copy: run `npm run sync:progress-report-templates`
 * after changing this file so `send-progress-report` / `export-progress-report-pdf` stay in sync.
 */

/** Public URL for SiteWeave footer mark (matches other SiteWeave transactional email). */
const SITEWEAVE_LOGO_URL = 'https://app.siteweave.org/logo.svg';

// ─── helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatReportPeriod(startDate, endDate) {
  if (!startDate && !endDate) return '';
  if (startDate && endDate) {
    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  }
  return startDate ? `Since ${formatDate(startDate)}` : `Up to ${formatDate(endDate)}`;
}

function translateToClientFriendly(status) {
  const map = { 'In Progress': 'Active', 'On Hold': 'Paused', 'Completed': 'Finished' };
  return map[status] || status;
}

/** Report title line + reporting period (email-safe table layout). SiteWeave mark is in the email footer. */
function reportHeader(titleText, headerProjectTitle, primaryColor, period) {
  const accent = primaryColor || '#3B82F6';
  return `
  <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 28px;">
    <tr>
      <td style="vertical-align:top;padding:0;">
        <p style="margin:0;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">
          ${escapeHtml(titleText)} <span style="color:#9ca3af;font-weight:600;">—</span>
          <span style="color:${escapeHtml(accent)};font-weight:600;">${escapeHtml(headerProjectTitle)}</span>
        </p>
        <p style="margin:8px 0 0;color:#6b7280;font-size:13px;">${escapeHtml(period)}</p>
      </td>
    </tr>
  </table>`;
}

/** Derive which sections are enabled; default all content sections true, detail flags false. */
function resolveSections(schedule) {
  const s = schedule?.report_sections || {};
  const weeklySetting = s.weekly_plan ?? s.lookahead;
  return {
    status_changes:   s.status_changes   !== false,
    task_completion:  s.task_completion  !== false,
    phase_changes:    s.phase_changes    !== false,
    vitals:           s.vitals           !== false,
    weekly_plan:      weeklySetting      !== false,
    // detail-level toggles (default off = clean client-facing output)
    show_assignees:         s.show_assignees        === true,
    show_dates:             s.show_dates            === true,
    show_who_changed:       s.show_who_changed      === true,
    show_phase_delta:       s.show_phase_delta      === true,
    show_blockers:          s.show_blockers         === true,
    show_weather_impacts:   s.show_weather_impacts  === true,
    include_task_photos:    s.include_task_photos === true,
    client_friendly_labels: s.client_friendly_labels !== false, // default true
    show_task_phase:        s.show_task_phase === true,
    show_siteweave_logo:    s.show_siteweave_logo !== false, // default on
  };
}

/** Small phase label next to a task title when enabled in report_sections. */
function taskPhaseTagHtml(task, sections, primary) {
  if (!sections.show_task_phase || !task?.phase_name) return '';
  const accent = primary || '#3B82F6';
  return ` <span style="display:inline-block;margin-left:6px;padding:1px 6px;font-size:10px;font-weight:600;color:${escapeHtml(accent)};background-color:#f3f4f6;border-radius:4px;border:1px solid #e5e7eb;white-space:nowrap;vertical-align:middle;line-height:1.25;">${escapeHtml(String(task.phase_name))}</span>`;
}

function weeklyTaskProjectHtml(task) {
  if (!task?.project_name) return '';
  return ` <span style="color:#9ca3af;font-size:11px;">· ${escapeHtml(String(task.project_name))}</span>`;
}

// ─── shared email shell ────────────────────────────────────────────────────────

function emailShell({ subject, branding, bodyHtml, showSiteweaveLogo }) {
  const orgName = escapeHtml(branding.organization_name || 'SiteWeave');
  const siteweaveFooterBlock =
    showSiteweaveLogo !== false
      ? `<table role="presentation" style="margin:0 auto;border-collapse:collapse;">
    <tr>
      <td style="padding:0 10px 0 0;vertical-align:middle;">
        <img src="${SITEWEAVE_LOGO_URL}" alt="SiteWeave" width="36" height="36" style="display:block;width:36px;height:36px;border:0;">
      </td>
      <td style="vertical-align:middle;text-align:left;">
        <p style="margin:0 0 4px;color:#9ca3af;font-size:11px;">Generated by SiteWeave</p>
        <p style="margin:0;color:#9ca3af;font-size:11px;">Automated progress report from ${orgName}</p>
      </td>
    </tr>
  </table>`
      : `<p style="margin:0 0 4px;color:#9ca3af;font-size:11px;">Generated by SiteWeave</p>
            <p style="margin:0;color:#9ca3af;font-size:11px;">Automated progress report from ${orgName}</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:24px 20px 32px;">
        <div style="max-width:600px;margin:0 auto;">
          <div style="padding:8px 0 20px;">
            ${branding.logo_url ? `<div style="text-align:center;margin-bottom:24px;">
              <img src="${branding.logo_url}" alt="Logo" style="max-height:56px;max-width:180px;">
            </div>` : ''}
            ${bodyHtml}
          </div>
          ${branding.company_footer ? `
          <div style="padding:16px 0 0;margin-top:12px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">${branding.company_footer}</p>
          </div>` : ''}
          ${branding.email_signature ? `
          <div style="padding:12px 0 0;margin-top:12px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">${escapeHtml(branding.email_signature)}</p>
          </div>` : ''}
          <div style="padding:12px 0 0;margin-top:12px;text-align:center;border-top:1px solid #e5e7eb;">
            ${siteweaveFooterBlock}
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── vitals row ────────────────────────────────────────────────────────────────

function vitalsHtml(vitals, primary, secondary) {
  if (!vitals) return '';
  const cells = [];
  if (vitals.tasks_completed_count != null && vitals.open_tasks_count != null) {
    cells.push({
      val: `${vitals.tasks_completed_count} / ${vitals.open_tasks_count}`,
      label: 'Tasks completed (all) / Open (not complete)',
      color: secondary,
      isText: true,
    });
  }
  if (vitals.project_end_date) {
    cells.push({
      val: formatDate(vitals.project_end_date),
      label: 'Project end (latest task due)',
      color: primary,
      isText: true,
    });
  }
  if (vitals.schedule_day_total != null && vitals.schedule_day_current != null) {
    cells.push({
      val: `${vitals.schedule_day_current} / ${vitals.schedule_day_total}`,
      subVal: vitals.schedule_progress_pct != null ? `${vitals.schedule_progress_pct}% through schedule` : null,
      label: 'Schedule timeline',
      color: '#374151',
      isText: true,
    });
  }
  if (cells.length === 0) return '';
  const width = `${Math.floor(100 / cells.length)}%`;
  const cellHtml = cells.map((c, idx) => `
    <td style="width:${width};text-align:center;padding:16px 12px;${idx > 0 ? 'border-left:1px solid #e5e7eb;' : ''}">
      ${c.isText
        ? `<p style="margin:0;font-size:15px;font-weight:600;color:${c.color};line-height:1.3;">${escapeHtml(String(c.val))}</p>
           ${c.subVal ? `<p style="margin:4px 0 0;font-size:11px;color:#6b7280;">${escapeHtml(c.subVal)}</p>` : ''}`
        : `<p style="margin:0;font-size:30px;font-weight:700;color:${c.color};line-height:1;">${escapeHtml(String(c.val))}</p>`}
      <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;font-weight:500;">${escapeHtml(c.label)}</p>
    </td>`).join('');
  return `
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;margin-bottom:28px;">
    <tr>${cellHtml}</tr>
  </table>`;
}

// ─── lookahead section ─────────────────────────────────────────────────────────

function weeklyPlanHtml(reportData, primary, sections, showWeeklyProjectTag = true) {
  const lastWeek = reportData.last_week_done || [];
  const thisWeek = reportData.this_week_plan || [];
  const nextWeek = reportData.next_week_plan || [];
  const wkProj = (task) => (showWeeklyProjectTag ? weeklyTaskProjectHtml(task) : '');
  const hasAny = lastWeek.length > 0 || thisWeek.length > 0 || nextWeek.length > 0;
  if (!hasAny) {
    return `
    <div style="margin-bottom:28px;">
      ${sectionHeading('Weekly Plan', primary)}
      <p style="margin:0;color:#6b7280;font-size:13px;">No updates were scheduled for last week, this week, or next week.</p>
    </div>`;
  }
  return `
  <div style="margin-bottom:28px;">
    ${sectionHeading('Weekly Plan', primary)}
    <p style="margin:0 0 14px;color:#6b7280;font-size:12px;line-height:1.5;">Tasks with a scheduled start in each window—not every open task.</p>
    <div style="margin-bottom:14px;">
      <p style="margin:0 0 6px;color:#065f46;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">We did this last week</p>
      ${lastWeek.length
        ? `<ul style="margin:0;padding-left:18px;color:#374151;">${lastWeek.map((task) => `<li style="margin-bottom:6px;font-size:13px;line-height:1.5;">${escapeHtml(task.text || 'Task')}${taskPhaseTagHtml(task, sections, primary)}${wkProj(task)}</li>`).join('')}</ul>`
        : '<p style="margin:0;color:#6b7280;font-size:13px;">No completed tasks in the last week.</p>'}
    </div>
    <div style="margin-bottom:14px;">
      <p style="margin:0 0 6px;color:#1e3a8a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Here is what we are doing this week</p>
      ${thisWeek.length
        ? `<ul style="margin:0;padding-left:18px;color:#374151;">${thisWeek.map((task) => `<li style="margin-bottom:6px;font-size:13px;line-height:1.5;">${escapeHtml(task.text || 'Task')}${taskPhaseTagHtml(task, sections, primary)}${wkProj(task)}${task.start_date ? `<span style="color:#9ca3af;font-size:11px;"> (starts ${escapeHtml(String(task.start_date))})</span>` : ''}</li>`).join('')}</ul>`
        : '<p style="margin:0;color:#6b7280;font-size:13px;">No tasks scheduled this week.</p>'}
    </div>
    <div>
      <p style="margin:0 0 6px;color:#3730a3;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Here is what we will do next week</p>
      ${nextWeek.length
        ? `<ul style="margin:0;padding-left:18px;color:#374151;">${nextWeek.map((task) => `<li style="margin-bottom:6px;font-size:13px;line-height:1.5;">${escapeHtml(task.text || 'Task')}${taskPhaseTagHtml(task, sections, primary)}${wkProj(task)}${task.start_date ? `<span style="color:#9ca3af;font-size:11px;"> (starts ${escapeHtml(String(task.start_date))})</span>` : ''}</li>`).join('')}</ul>`
        : '<p style="margin:0;color:#6b7280;font-size:13px;">No tasks scheduled for next week.</p>'}
    </div>
  </div>`;
}

// ─── section heading helper ────────────────────────────────────────────────────

function sectionHeading(title, primary) {
  return `<h2 style="color:#1f2937;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid ${primary};">${escapeHtml(title)}</h2>`;
}

function weatherImpactsHtml(reportData, primary, showProjectNames = true) {
  const items = reportData.weather_impacts || [];
  if (!items.length) return '';
  const projSuffix = (w) =>
    showProjectNames && w.project_name
      ? ` <span style="color:#9ca3af;font-size:12px;">(${escapeHtml(w.project_name)})</span>`
      : '';
  return `
    <div style="margin-bottom:28px;">
      ${sectionHeading('Weather & schedule impacts', primary)}
      <ul style="margin:0;padding-left:18px;color:#374151;">
        ${items.map((w) => `
          <li style="margin-bottom:12px;font-size:14px;line-height:1.6;">
            <strong>${escapeHtml(w.title || 'Impact')}</strong>
            ${projSuffix(w)}
            <br/>
            <span style="color:#6b7280;">${escapeHtml(String(w.days_lost ?? ''))} calendar day${Number(w.days_lost) !== 1 ? 's' : ''} lost</span>
            ${w.schedule_shift_applied ? ' · <span style="color:#059669;">schedule updated</span>' : ' · <span style="color:#9ca3af;">logged only</span>'}
            ${w.description ? `<br/><span>${escapeHtml(w.description)}</span>` : ''}
          </li>
        `).join('')}
      </ul>
    </div>`;
}

function taskPhotosHtml(photos = []) {
  if (!photos || photos.length === 0) return '';
  return `
  <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:10px;">
    ${photos.map((photo) => `
      <div style="width:120px;">
        <a href="${escapeHtml(photo.full_url || photo.thumbnail_url || '#')}" target="_blank" rel="noreferrer" style="display:block;text-decoration:none;">
          <img
            src="${escapeHtml(photo.thumbnail_url || photo.full_url || '')}"
            alt="${escapeHtml(photo.caption || 'Task photo')}"
            style="display:block;width:120px;height:90px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;background:#f9fafb;"
          >
        </a>
        ${photo.caption ? `<p style="margin:6px 0 0;color:#6b7280;font-size:11px;line-height:1.4;">${escapeHtml(photo.caption)}</p>` : ''}
        ${photo.is_completion_photo ? `<p style="margin:4px 0 0;color:#059669;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Completion photo</p>` : ''}
      </div>`).join('')}
  </div>`;
}

// ─── STANDARD template (replaces both Client and Internal) ────────────────────
// Detail-level flags in report_sections control what recipients see.

function orgStackSummaryHtml(reportData, projectCount) {
  const v = reportData.vitals;
  if (!v || !projectCount) return '';
  const done = v.tasks_completed_count ?? 0;
  const open = v.open_tasks_count ?? 0;
  return `
  <div style="margin-bottom:24px;padding:12px 14px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
    <p style="margin:0;color:#1e293b;font-size:14px;line-height:1.55;">
      <strong>${projectCount}</strong> project${projectCount !== 1 ? 's' : ''} in this report
      <span style="color:#94a3b8;"> · </span>
      <strong>${done}</strong> task${done !== 1 ? 's' : ''} completed (all projects)
      <span style="color:#94a3b8;"> · </span>
      <strong>${open}</strong> not complete
    </p>
  </div>`;
}

function blockersAndNextStepsHtml(reportData, primary, sections) {
  const blockers = sections.show_blockers && reportData.blockers?.length
    ? `<div style="margin-bottom:28px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px 18px;">
      <h2 style="color:#991b1b;font-size:14px;font-weight:600;margin:0 0 10px;">Blockers &amp; Issues</h2>
      <ul style="margin:0;padding-left:18px;color:#7f1d1d;">
        ${reportData.blockers.map((b) => `<li style="margin-bottom:7px;font-size:14px;line-height:1.6;">${escapeHtml(b)}</li>`).join('')}
      </ul>
    </div>`
    : '';
  const nextSteps = reportData.next_steps?.length
    ? `<div style="margin-bottom:28px;">
      ${sectionHeading("What's Next", primary)}
      <ul style="margin:0;padding-left:18px;color:#374151;">
        ${reportData.next_steps.map((step) => `<li style="margin-bottom:7px;font-size:14px;line-height:1.6;">${escapeHtml(step)}</li>`).join('')}
      </ul>
    </div>`
    : '';
  return `${blockers}${nextSteps}`;
}

/** Vitals, activity, phases, snapshot, weekly plan, weather — optionally blockers/next steps. */
function standardReportSectionsHtml(reportData, schedule, branding, options = {}) {
  const showWeeklyProjectTag = options.showWeeklyProjectTag !== false;
  const showWeatherProjectNames = options.showWeatherProjectNames !== false;
  const includeBlockersAndNextSteps = options.includeBlockersAndNextSteps !== false;

  const primary   = branding.primary_color   || '#3B82F6';
  const secondary = branding.secondary_color || '#10B981';
  const sections  = resolveSections(schedule);
  const isInternalAudience = schedule.report_audience_type === 'internal';
  const showTaskPhotos = isInternalAudience || sections.include_task_photos;

  const hasActivity =
    (reportData.status_changes  && reportData.status_changes.length  > 0) ||
    (reportData.completed_tasks && reportData.completed_tasks.length > 0) ||
    (reportData.phase_progress  && reportData.phase_progress.length  > 0) ||
    (reportData.weather_impacts && reportData.weather_impacts.length > 0);

  const snap = reportData.snapshot;
  const snapshotOtProj = (ot) => (showWeeklyProjectTag ? weeklyTaskProjectHtml(ot) : '');
  const snapshotSection = !hasActivity && snap && (snap.open_tasks?.length || snap.phases?.length || snap.open_total != null)
    ? `<div style="margin-bottom:28px;padding:20px;background-color:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
        <p style="margin:0 0 14px;color:#6b7280;font-size:14px;line-height:1.6;">No changes recorded in this reporting window. Here is a snapshot as of today.</p>
        ${snap.open_total != null || snap.completed_total != null
          ? `<p style="margin:0 0 14px;color:#374151;font-size:14px;"><strong>${snap.open_total ?? 0}</strong> open, <strong>${snap.completed_total ?? 0}</strong> completed overall.</p>`
          : ''}
        ${snap.open_tasks?.length ? `
          <p style="margin:0 0 8px;color:#374151;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Open work</p>
          <ul style="margin:0 0 16px;padding-left:18px;color:#374151;">
            ${snap.open_tasks.map((ot) => `<li style="margin-bottom:5px;font-size:13px;line-height:1.5;">
              ${escapeHtml(ot.text || 'Task')}${taskPhaseTagHtml(ot, sections, primary)}${snapshotOtProj(ot)}
              ${ot.due_date ? `<span style="color:#9ca3af;font-size:11px;"> — due ${escapeHtml(String(ot.due_date))}</span>` : ''}
              ${showTaskPhotos && ot.photos?.length ? taskPhotosHtml(ot.photos) : ''}
            </li>`).join('')}
          </ul>` : ''}
        ${snap.phases?.length ? `
          <p style="margin:0 0 8px;color:#374151;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Phase progress</p>
          ${snap.phases.map((ph) => `
            <div style="margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="font-size:13px;color:#374151;">${escapeHtml(ph.name || 'Phase')}</span>
                <span style="font-size:12px;color:#6b7280;">${ph.progress || 0}%</span>
              </div>
              <div style="background-color:#e5e7eb;border-radius:3px;height:6px;overflow:hidden;">
                <div style="background-color:${secondary};height:100%;width:${Math.min(100, Math.max(0, ph.progress || 0))}%;"></div>
              </div>
            </div>`).join('')}` : ''}
      </div>` : '';

  const tasksHtml = sections.task_completion && reportData.completed_tasks?.length
    ? `<div style="margin-bottom:28px;">
        ${sectionHeading('Completed This Period', primary)}
        ${showTaskPhotos
          ? `${reportData.completed_tasks.map((task) => `
              <div style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
                <div style="display:flex;align-items:flex-start;gap:8px;font-size:14px;color:#374151;line-height:1.5;">
                  <span style="color:${secondary};font-weight:700;flex-shrink:0;">✓</span>
                  <div style="flex:1;">
                    <p style="margin:0;font-size:14px;color:#374151;font-weight:600;">${escapeHtml(task.text || task.title)}${taskPhaseTagHtml(task, sections, primary)}</p>
                    <p style="margin:4px 0 0;color:#9ca3af;font-size:11px;">
                      ${task.assignee ? `@${escapeHtml(task.assignee)}` : ''}
                      ${task.assignee && task.completed_at ? ' · ' : ''}
                      ${task.completed_at ? formatDate(task.completed_at) : ''}
                    </p>
                    ${taskPhotosHtml(task.photos || [])}
                  </div>
                </div>
              </div>`).join('')}`
          : (sections.show_assignees || sections.show_dates)
          ? `<table role="presentation" style="width:100%;border-collapse:collapse;">
              ${reportData.completed_tasks.map((task) => `
                <tr style="border-bottom:1px solid #f3f4f6;">
                  <td style="padding:8px 8px 8px 0;width:20px;color:${secondary};font-weight:700;">✓</td>
                  <td style="padding:8px 0;font-size:14px;color:#374151;">${escapeHtml(task.text || task.title)}${taskPhaseTagHtml(task, sections, primary)}</td>
                  ${sections.show_assignees && task.assignee
                    ? `<td style="padding:8px 0 8px 8px;font-size:12px;color:#9ca3af;text-align:right;white-space:nowrap;">@${escapeHtml(task.assignee)}</td>`
                    : '<td></td>'}
                  ${sections.show_dates && task.completed_at
                    ? `<td style="padding:8px 0 8px 8px;font-size:11px;color:#9ca3af;text-align:right;white-space:nowrap;">${formatDate(task.completed_at)}</td>`
                    : '<td></td>'}
                </tr>`).join('')}
            </table>`
          : `<ul style="margin:0;padding:0;list-style:none;">
              ${reportData.completed_tasks.map((task) => `
                <li style="padding:7px 0;border-bottom:1px solid #f3f4f6;display:flex;align-items:flex-start;gap:8px;font-size:14px;color:#374151;line-height:1.5;">
                  <span style="color:${secondary};font-weight:700;flex-shrink:0;">✓</span>
                  <span>${escapeHtml(task.text || task.title)}${taskPhaseTagHtml(task, sections, primary)}</span>
                </li>`).join('')}
            </ul>`}
      </div>`
    : '';

  const middle = `
    ${sections.vitals ? vitalsHtml(reportData.vitals, primary, secondary) : ''}

    ${sections.status_changes && reportData.status_changes?.length ? `
    <div style="margin-bottom:28px;">
      ${sectionHeading('Status Update', primary)}
      ${reportData.status_changes.map((change) => {
        const label = sections.client_friendly_labels
          ? translateToClientFriendly(change.new_status)
          : (change.new_status || '');
        return `
        <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 14px;margin-bottom:8px;">
          <p style="margin:0;color:#166534;font-weight:600;font-size:14px;">${escapeHtml(change.project_name || 'Project')}</p>
          <p style="margin:5px 0 0;color:#15803d;font-size:13px;">
            <span style="text-decoration:line-through;color:#9ca3af;">${escapeHtml(change.old_status)}</span>
            <span style="margin:0 6px;color:#6b7280;">→</span>
            <strong style="color:${secondary};">${escapeHtml(label)}</strong>
            ${sections.show_who_changed && change.changed_by ? `<span style="color:#9ca3af;font-size:11px;margin-left:6px;">· ${escapeHtml(change.changed_by)}</span>` : ''}
            ${sections.show_who_changed && change.changed_at ? `<span style="color:#9ca3af;font-size:11px;margin-left:4px;">${formatDate(change.changed_at)}</span>` : ''}
          </p>
        </div>`;
      }).join('')}
    </div>` : ''}

    ${tasksHtml}

    ${sections.phase_changes && reportData.phase_progress?.length ? `
    <div style="margin-bottom:28px;">
      ${sectionHeading('Phase Progress', primary)}
      ${reportData.phase_progress.map((phase) => `
        <div style="margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
            <span style="font-size:13px;font-weight:500;color:#374151;">${escapeHtml(phase.name)}</span>
            <span style="font-size:13px;font-weight:600;color:${primary};">
              ${sections.show_phase_delta && phase.old_progress != null
                ? `${phase.old_progress || 0}% → ${phase.progress || 0}%`
                : `${phase.progress || 0}%`}
            </span>
          </div>
          <div style="background-color:#e5e7eb;border-radius:3px;height:8px;overflow:hidden;">
            <div style="background-color:${secondary};height:100%;width:${phase.progress || 0}%;"></div>
          </div>
        </div>`).join('')}
    </div>` : ''}

    ${snapshotSection}

    ${sections.weekly_plan ? weeklyPlanHtml(reportData, primary, sections, showWeeklyProjectTag) : ''}

    ${sections.show_weather_impacts && reportData.weather_impacts?.length ? weatherImpactsHtml(reportData, primary, showWeatherProjectNames) : ''}

    ${includeBlockersAndNextSteps ? blockersAndNextStepsHtml(reportData, primary, sections) : ''}
  `;

  return middle;
}

function generateStandardReportEmail(reportData, schedule, branding) {
  const subject = schedule.custom_subject || `Progress Update: ${reportData.project_name || 'Your Project'}`;
  const period  = formatReportPeriod(reportData.start_date, reportData.end_date);
  const primary   = branding.primary_color   || '#3B82F6';
  const secondary = branding.secondary_color || '#10B981';
  const sections  = resolveSections(schedule);

  const slices = Array.isArray(reportData.org_project_slices) ? reportData.org_project_slices : null;
  const customMsg = schedule.custom_message ? `
    <div style="background-color:#f0f9ff;border-left:4px solid ${secondary};padding:14px 16px;margin-bottom:28px;border-radius:0 4px 4px 0;">
      <p style="margin:0;color:#1e40af;font-size:14px;line-height:1.7;">${escapeHtml(schedule.custom_message)}</p>
    </div>` : '';

  let body;
  if (slices && slices.length > 0) {
    const headerProjectTitle = reportData.organization_name || 'Organization';
    const orgSummary = orgStackSummaryHtml(reportData, slices.length);
    const sliceBlocks = slices.map((slice, idx) => {
      const merged = { ...reportData, ...slice };
      delete merged.org_project_slices;
      const statusLabel = slice.project_status
        ? (sections.client_friendly_labels
          ? translateToClientFriendly(slice.project_status)
          : slice.project_status)
        : '';
      const statusLine = statusLabel
        ? `<p style="margin:0 0 14px;font-size:12px;color:#6b7280;">Status: ${escapeHtml(statusLabel)}</p>`
        : '';
      const topPad = idx === 0 ? 'margin-top:12px;' : 'margin-top:28px;';
      return `
    <div style="${topPad}padding:22px 16px 0;border-top:1px solid #e5e7eb;background-color:#fafafa;border-radius:8px;">
      <p style="margin:0 0 2px;font-size:18px;font-weight:700;color:#111827;">${escapeHtml(slice.project_name || 'Project')}</p>
      ${statusLine}
      ${standardReportSectionsHtml(merged, schedule, branding, {
        showWeeklyProjectTag: false,
        showWeatherProjectNames: false,
        includeBlockersAndNextSteps: false,
      })}
    </div>`;
    }).join('');

    body = `
    ${reportHeader('Progress Update', headerProjectTitle, primary, period)}
    ${customMsg}
    ${orgSummary}
    ${sliceBlocks}
    ${blockersAndNextStepsHtml(reportData, primary, sections)}
  `;
  } else {
    const headerProjectTitle = reportData.project_name || reportData.organization_name || 'Project';
    body = `
    ${reportHeader('Progress Update', headerProjectTitle, primary, period)}
    ${customMsg}
    ${standardReportSectionsHtml(reportData, schedule, branding)}
  `;
  }

  const html = emailShell({
    subject,
    branding: { ...branding, organization_name: reportData.organization_name },
    bodyHtml: body,
    showSiteweaveLogo: sections.show_siteweave_logo,
  });
  const text = generateTextVersion(reportData, schedule, period);
  return { subject, html, text };
}

// Backward-compat alias so any external callers still work


// ─── EXECUTIVE template ───────────────────────────────────────────────────────

function generateExecutiveReportEmail(reportData, schedule, branding) {
  const subject = schedule.custom_subject || `Brief: ${reportData.organization_name || 'Organization'} Status`;
  const period  = formatReportPeriod(reportData.start_date, reportData.end_date);
  const primary   = branding.primary_color   || '#3B82F6';
  const secondary = branding.secondary_color || '#10B981';
  const sections = resolveSections(schedule);

  const headerProjectTitle = reportData.project_name || reportData.organization_name || 'Organization';
  let body = `
    ${reportHeader('Brief', headerProjectTitle, primary, period)}

    ${reportData.executive_summary ? `
    <div style="background-color:#f0f9ff;border-left:4px solid ${primary};padding:18px 20px;margin-bottom:28px;border-radius:0 4px 4px 0;">
      <p style="margin:0;color:#1e3a8a;font-size:15px;line-height:1.8;">${escapeHtml(reportData.executive_summary)}</p>
    </div>` : ''}

    ${reportData.at_a_glance ? `
    <div style="margin-bottom:28px;">
      <h2 style="color:#111827;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 14px;">At a Glance</h2>
      <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px;">
        <tr>
          <td style="width:33%;text-align:center;padding:18px 12px;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;">
            <p style="margin:0;font-size:36px;font-weight:700;color:${secondary};line-height:1;">${reportData.at_a_glance.on_track || 0}</p>
            <p style="margin:6px 0 0;font-size:11px;color:#166534;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">On Track</p>
          </td>
          <td style="width:33%;text-align:center;padding:18px 12px;background-color:#fffbeb;border:1px solid #fde68a;border-radius:6px;">
            <p style="margin:0;font-size:36px;font-weight:700;color:#d97706;line-height:1;">${reportData.at_a_glance.at_risk || 0}</p>
            <p style="margin:6px 0 0;font-size:11px;color:#92400e;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">At Risk</p>
          </td>
          <td style="width:33%;text-align:center;padding:18px 12px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:6px;">
            <p style="margin:0;font-size:36px;font-weight:700;color:#ef4444;line-height:1;">${reportData.at_a_glance.behind || 0}</p>
            <p style="margin:6px 0 0;font-size:11px;color:#991b1b;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Behind</p>
          </td>
        </tr>
      </table>
    </div>` : ''}

    ${reportData.key_highlights?.length ? `
    <div style="margin-bottom:28px;">
      ${sectionHeading('Key Highlights', primary)}
      <ul style="margin:0;padding-left:18px;color:#374151;">
        ${reportData.key_highlights.map(h => `<li style="margin-bottom:9px;font-size:14px;line-height:1.6;">${escapeHtml(h)}</li>`).join('')}
      </ul>
    </div>` : ''}

    ${sections.show_weather_impacts && reportData.weather_impacts?.length ? weatherImpactsHtml(reportData, primary) : ''}

    ${reportData.project_summary?.length ? `
    <div style="margin-bottom:28px;">
      ${sectionHeading('Project Status', primary)}
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        ${reportData.project_summary.map(project => {
          const statusColor = project.status === 'on_track' ? secondary : project.status === 'at_risk' ? '#d97706' : '#ef4444';
          const dot = project.status === 'on_track' ? `background-color:${secondary};` : project.status === 'at_risk' ? 'background-color:#d97706;' : 'background-color:#ef4444;';
          return `<tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:12px 0;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;${dot}flex-shrink:0;"></span>
                <div>
                  <p style="margin:0;color:#1f2937;font-weight:600;font-size:14px;">${escapeHtml(project.name)}</p>
                  <p style="margin:3px 0 0;color:#6b7280;font-size:12px;">${escapeHtml(project.status_text || project.status)}</p>
                </div>
              </div>
            </td>
            <td style="padding:12px 0;text-align:right;white-space:nowrap;">
              <span style="font-size:16px;font-weight:700;color:${statusColor};">${project.progress || 0}%</span>
            </td>
          </tr>`;
        }).join('')}
      </table>
    </div>` : ''}

    ${reportData.attention_required?.length ? `
    <div style="margin-bottom:28px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px 18px;">
      <h2 style="color:#991b1b;font-size:14px;font-weight:600;margin:0 0 10px;">Attention Required</h2>
      <ul style="margin:0;padding-left:18px;color:#7f1d1d;">
        ${reportData.attention_required.map(item => `<li style="margin-bottom:7px;font-size:14px;line-height:1.6;">${escapeHtml(item)}</li>`).join('')}
      </ul>
    </div>` : ''}
  `;

  const html = emailShell({
    subject,
    branding: { ...branding, organization_name: reportData.organization_name },
    bodyHtml: body,
    showSiteweaveLogo: sections.show_siteweave_logo,
  });
  const text = generateTextVersion(reportData, schedule, period);
  return { subject, html, text };
}

// ─── plain-text fallback ──────────────────────────────────────────────────────

function generateTextVersion(reportData, schedule, period) {
  const sections = resolveSections(schedule);
  const phaseTxt = (t) => (sections.show_task_phase && t?.phase_name ? ` [${t.phase_name}]` : '');
  const projectTxt = (t) => (t?.project_name ? ` (${t.project_name})` : '');
  const slices = Array.isArray(reportData.org_project_slices) ? reportData.org_project_slices : null;

  let text = `${schedule.custom_subject || 'Progress Report'}\n\n`;
  text += `${period}\n\n`;

  if (schedule.custom_message) text += `${schedule.custom_message}\n\n`;

  const appendOrgVitalsSummary = () => {
    if (!reportData.vitals) return;
    const v = reportData.vitals;
    if (slices?.length) {
      text += `${slices.length} project(s) in this report. `;
    }
    if (v.tasks_completed_count != null && v.open_tasks_count != null) {
      text += `Tasks completed (all) / Open (not complete): ${v.tasks_completed_count} / ${v.open_tasks_count}\n`;
    }
    if (v.project_end_date) text += `Project end (latest task due): ${formatDate(v.project_end_date)}\n`;
    if (v.schedule_day_total != null && v.schedule_day_current != null) {
      text += `Schedule timeline: ${v.schedule_day_current} / ${v.schedule_day_total} days`;
      if (v.schedule_progress_pct != null) text += ` (${v.schedule_progress_pct}% through schedule)`;
      text += '\n';
    }
    text += '\n';
  };

  const appendStandardTextBody = (data, weeklyProjectTag) => {
    const wkProj = (t) => (weeklyProjectTag ? projectTxt(t) : '');

    if (data.executive_summary) {
      text += `Summary:\n${data.executive_summary}\n\n`;
    }

    if (data.status_changes?.length) {
      text += `Status Changes:\n`;
      data.status_changes.forEach((c) => {
        text += `- ${c.project_name || 'Project'}: ${c.old_status} -> ${c.new_status}\n`;
      });
      text += '\n';
    }

    if (data.completed_tasks?.length) {
      text += `Completed this period:\n`;
      data.completed_tasks.forEach((t) => {
        text += `- [x] ${t.text || t.title}${phaseTxt(t)}${t.assignee ? ` (@${t.assignee})` : ''}${t.photos?.length ? ` [${t.photos.length} photo(s)]` : ''}\n`;
      });
      text += '\n';
    }

    if (data.phase_progress?.length) {
      text += `Phase Progress:\n`;
      data.phase_progress.forEach((p) => {
        text += `- ${p.name}: ${p.progress || 0}%\n`;
      });
      text += '\n';
    }

    if (sections.show_weather_impacts && data.weather_impacts?.length) {
      text += `Weather & schedule impacts:\n`;
      data.weather_impacts.forEach((w) => {
        const pn = weeklyProjectTag && w.project_name ? ` (${w.project_name})` : '';
        text += `- ${w.title || 'Impact'}${pn}: ${w.days_lost} day(s) lost${w.schedule_shift_applied ? ' (schedule updated)' : ' (logged only)'}\n`;
        if (w.description) text += `  ${w.description}\n`;
      });
      text += '\n';
    }

    if (sections.weekly_plan) {
      text += `Weekly Plan:\n`;
      text += `We did this last week:\n`;
      if (data.last_week_done?.length) {
        data.last_week_done.forEach((t) => {
          text += `- ${t.text || 'Task'}${phaseTxt(t)}${wkProj(t)}\n`;
        });
      } else {
        text += `- No completed tasks in the last week.\n`;
      }
      text += `\nHere's what we are doing this week:\n`;
      if (data.this_week_plan?.length) {
        data.this_week_plan.forEach((t) => {
          text += `- ${t.text || 'Task'}${phaseTxt(t)}${wkProj(t)}${t.start_date ? ` (starts ${t.start_date})` : ''}\n`;
        });
      } else {
        text += `- No tasks scheduled this week.\n`;
      }
      text += `\nHere's what we will do next week:\n`;
      if (data.next_week_plan?.length) {
        data.next_week_plan.forEach((t) => {
          text += `- ${t.text || 'Task'}${phaseTxt(t)}${wkProj(t)}${t.start_date ? ` (starts ${t.start_date})` : ''}\n`;
        });
      } else {
        text += `- No tasks scheduled for next week.\n`;
      }
      text += '\n';
    }

    const hasAct =
      data.status_changes?.length ||
      data.completed_tasks?.length ||
      data.phase_progress?.length ||
      (sections.show_weather_impacts && data.weather_impacts?.length);
    const snap = data.snapshot;
    if (!hasAct && snap) {
      text += `No activity recorded this window.\n`;
      text += `Snapshot: ${snap.open_total ?? 0} open, ${snap.completed_total ?? 0} completed overall.\n\n`;
      snap.open_tasks?.forEach((ot) => { text += `- ${ot.text || 'Task'}${phaseTxt(ot)}${wkProj(ot)}\n`; });
      snap.phases?.forEach((ph) => { text += `- ${ph.name}: ${ph.progress || 0}%\n`; });
    }
  };

  if (slices && slices.length > 0) {
    appendOrgVitalsSummary();
    slices.forEach((slice) => {
      const merged = { ...reportData, ...slice };
      delete merged.org_project_slices;
      text += `\n--- ${slice.project_name || 'Project'} ---\n`;
      appendStandardTextBody(merged, false);
    });
    if (reportData.blockers?.length && sections.show_blockers) {
      text += `\nBlockers:\n`;
      reportData.blockers.forEach((b) => { text += `- ${b}\n`; });
    }
    if (reportData.next_steps?.length) {
      text += `\nWhat's Next:\n`;
      reportData.next_steps.forEach((s) => { text += `- ${s}\n`; });
    }
    return text;
  }

  if (reportData.vitals) {
    const v = reportData.vitals;
    if (v.tasks_completed_count != null && v.open_tasks_count != null) {
      text += `Tasks completed (all) / Open (not complete): ${v.tasks_completed_count} / ${v.open_tasks_count}\n`;
    }
    if (v.project_end_date) text += `Project end (latest task due): ${formatDate(v.project_end_date)}\n`;
    if (v.schedule_day_total != null && v.schedule_day_current != null) {
      text += `Schedule timeline: ${v.schedule_day_current} / ${v.schedule_day_total} days`;
      if (v.schedule_progress_pct != null) text += ` (${v.schedule_progress_pct}% through schedule)`;
      text += '\n';
    }
    text += '\n';
  }

  appendStandardTextBody(reportData, true);
  return text;
}

export function buildProgressReportEmail(reportData, filteredData, schedule, branding) {
  const audience = schedule.report_audience_type || 'standard';
  if (audience === 'executive') return generateExecutiveReportEmail(filteredData, schedule, branding);
  // standard / client / internal all use the unified standard template
  return generateStandardReportEmail(filteredData, schedule, branding);
}
