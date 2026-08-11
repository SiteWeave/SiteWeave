/**
 * Site Day / daily log helpers — structured payload, body text, passive-ready detection.
 */

function resolveDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
}

export function todayIso(date = new Date()) {
  return resolveDate(date).toISOString().split('T')[0];
}

export function wasCompletedToday(task, date = new Date()) {
  if (!task?.completed) return false;
  const ref = task.updated_at || task.completed_at;
  const day = todayIso(date);
  if (!ref) return true;
  return String(ref).startsWith(day);
}

export function weatherImpactIsToday(impact, date = new Date()) {
  const d = impact?.start_date || impact?.created_at;
  if (!d) return false;
  return String(d).startsWith(todayIso(date));
}

/**
 * @param {Object} params
 * @returns {import('./siteDayLog.js').SiteDaySections}
 */
export function buildSiteDaySections({
  completedTasks = [],
  weatherImpacts = [],
  openIssues = [],
  notes = '',
  crewOnSite = [],
} = {}) {
  return {
    work_completed: (completedTasks || []).map((task) => ({
      task_id: task.id || null,
      title: task.text || task.title || '',
    })),
    weather: (weatherImpacts || []).map((impact) => ({
      impact_id: impact.id || null,
      summary:
        impact.title ||
        impact.impact_type ||
        impact.reason ||
        '',
      days_lost: impact.days_lost ?? null,
    })),
    blockers: (openIssues || []).slice(0, 10).map((issue) => ({
      issue_id: issue.id || null,
      title: issue.title || '',
      category: issue.category || 'delay',
    })),
    crew_on_site: (crewOnSite || []).map((row) => ({
      contact_id: row.contact_id || null,
      trade: row.trade || '',
      name: row.name || '',
      count: Math.max(1, Number(row.count) || 1),
    })),
    notes: String(notes || '').trim(),
  };
}

/**
 * @param {Object} sections
 * @param {(key: string, opts?: object) => string} t
 */
export function buildSiteDayBodyFromSections(sections, t) {
  const lines = [];
  lines.push(t('mobile.site_day_heading'));

  const work = sections?.work_completed || [];
  if (work.length > 0) {
    lines.push('');
    lines.push(t('mobile.site_day_completed'));
    work.forEach((row) => {
      lines.push(`• ${row.title || t('mobile.site_day_untitled_task')}`);
    });
  }

  const weather = sections?.weather || [];
  if (weather.length > 0) {
    lines.push('');
    lines.push(t('mobile.site_day_weather'));
    weather.forEach((row) => {
      const label = row.summary || t('mobile.weather_reason_other');
      lines.push(`• ${label}${row.days_lost ? ` (${row.days_lost}d)` : ''}`);
    });
  }

  const blockers = sections?.blockers || [];
  if (blockers.length > 0) {
    lines.push('');
    lines.push(t('mobile.site_day_blockers'));
    blockers.forEach((row) => {
      lines.push(`• ${row.title}`);
    });
  }

  const crew = sections?.crew_on_site || [];
  if (crew.length > 0) {
    lines.push('');
    lines.push(t('mobile.site_day_crew'));
    crew.forEach((row) => {
      const label = [row.trade, row.name].filter(Boolean).join(' — ');
      lines.push(`• ${label || t('mobile.site_day_crew_member')}${row.count > 1 ? ` (${row.count})` : ''}`);
    });
  }

  if (sections?.notes?.trim()) {
    lines.push('');
    lines.push(sections.notes.trim());
  }

  return lines.join('\n').trim();
}

/** @deprecated Use buildSiteDayBodyFromSections */
export function buildDraftBody({ completedTasks, weatherImpacts, openIssues, note, t }) {
  return buildSiteDayBodyFromSections(
    buildSiteDaySections({
      completedTasks,
      weatherImpacts,
      openIssues,
      notes: note,
    }),
    t,
  );
}

/**
 * @param {Object} payload - stream post payload
 * @returns {Object|null}
 */
export function parseDailyLogPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!payload.sections && !payload.log_date) return null;
  return {
    log_date: payload.log_date || null,
    sections: payload.sections || {},
    photos: Array.isArray(payload.photos) ? payload.photos : [],
  };
}

/**
 * Passive ready: auto data present, user has not customized.
 * @param {Object} params
 */
export function isPassiveSiteDayReady({
  sections,
  photos = [],
  userEdited = false,
  initialSnapshot = null,
} = {}) {
  if (userEdited) return false;
  if ((photos || []).length > 0) return false;

  const hasAuto =
    (sections?.work_completed?.length || 0) > 0 ||
    (sections?.weather?.length || 0) > 0 ||
    (sections?.blockers?.length || 0) > 0;
  if (!hasAuto) return false;

  if (sections?.notes?.trim()) return false;
  if ((sections?.crew_on_site?.length || 0) > 0) return false;

  if (initialSnapshot) {
    const sameWork = JSON.stringify(sections.work_completed) === JSON.stringify(initialSnapshot.work_completed);
    const sameWeather = JSON.stringify(sections.weather) === JSON.stringify(initialSnapshot.weather);
    const sameBlockers = JSON.stringify(sections.blockers) === JSON.stringify(initialSnapshot.blockers);
    if (!sameWork || !sameWeather || !sameBlockers) return false;
  }

  return true;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectId
 * @param {string} startDateIso
 * @param {string} endDateIso
 */
export async function fetchDailyLogsForReportPeriod(supabase, projectIds, organizationId, startDate, endDate) {
  const ids = Array.isArray(projectIds) ? projectIds.filter(Boolean) : [];
  if (!ids.length || !organizationId) return [];

  let query = supabase
    .from('project_stream_posts')
    .select('id, project_id, author_id, title, body, payload, file_url, file_name, created_at, projects!project_stream_posts_project_id_fkey(name)')
    .eq('organization_id', organizationId)
    .eq('post_type', 'daily_log')
    .in('project_id', ids)
    .order('created_at', { ascending: true });

  if (startDate) {
    query = query.gte('created_at', `${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    query = query.lte('created_at', `${endDate}T23:59:59.999Z`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    project_id: row.project_id,
    project_name: row.projects?.name || null,
    title: row.title,
    body: row.body,
    payload: row.payload,
    file_url: row.file_url || null,
    file_name: row.file_name || null,
    created_at: row.created_at,
  }));
}
