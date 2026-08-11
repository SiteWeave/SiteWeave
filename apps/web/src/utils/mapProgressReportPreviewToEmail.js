/**
 * Map live ProgressReportPreview data into the shape expected by
 * progressReportEmailTemplates.js (same HTML as send path).
 */

function formatExecutiveHighlight(item, p) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  switch (item.type) {
    case 'period_completed':
      return `${item.count} ${p('done_all_time').toLowerCase()}`;
    case 'schedule':
      return `${p('schedule_business_days')}: ${item.current}/${item.total}${
        item.pct != null ? ` (${item.pct}%)` : ''
      }`;
    case 'schedule_adjustments':
      return `${item.count} ${p('schedule_improvements')}`;
    case 'last_week':
      return `${item.count} — ${p('last_week')}`;
    case 'this_week':
      return `${item.count} — ${p('this_week')}`;
    case 'next_week':
      return `${item.count} — ${p('next_week')}`;
    case 'open_tasks':
      return `${item.count} ${p('not_complete').toLowerCase()}`;
    case 'weather':
      return `${item.count} ${p('weather_impacts')}`;
    default:
      return '';
  }
}

/**
 * @param {object} opts
 * @param {object} opts.previewData - from ProgressReportPreview getPreviewData
 * @param {object} opts.formData
 * @param {object} opts.branding
 * @param {'standard'|'executive'} opts.previewMode
 * @param {Array|null} opts.orgProjectPreviewSlices
 * @param {object|null} opts.selectedProject
 * @param {(key: string, opts?: object) => string} opts.p - preview i18n helper
 * @param {(key: string) => string} opts.t
 */
export function buildPreviewEmailPayload({
  previewData,
  formData,
  branding,
  previewMode,
  orgProjectPreviewSlices,
  selectedProject,
  p,
  t,
}) {
  const schedule = {
    report_audience_type: previewMode === 'executive' ? 'executive' : 'client',
    report_sections: formData?.report_sections || {},
    custom_subject: formData?.custom_subject || '',
    custom_message: formData?.custom_message || '',
  };

  const reportBranding = {
    logo_url: branding?.logo_url || null,
    primary_color: branding?.primary_color || '#3B82F6',
    secondary_color: branding?.secondary_color || '#10B981',
    company_footer: branding?.company_footer || '',
    email_signature: branding?.email_signature || '',
    organization_name:
      branding?.organization_name
      || previewData?.organization_name
      || '',
  };

  let reportData = { ...previewData };

  if (previewMode === 'executive' && Array.isArray(reportData.key_highlights)) {
    reportData = {
      ...reportData,
      key_highlights: reportData.key_highlights
        .map((h) => formatExecutiveHighlight(h, p))
        .filter(Boolean),
    };
  }

  if (
    previewMode === 'standard'
    && !selectedProject
    && Array.isArray(orgProjectPreviewSlices)
    && orgProjectPreviewSlices.length > 0
  ) {
    reportData = {
      ...reportData,
      org_project_slices: orgProjectPreviewSlices.map(({ project, slice }) => ({
        ...slice,
        project_name:
          project?.name
          || slice?.project_name
          || t('progressReports.builder.untitled_project'),
        project_status: project?.status || slice?.project_status || null,
      })),
    };
  }

  return { schedule, branding: reportBranding, reportData };
}
