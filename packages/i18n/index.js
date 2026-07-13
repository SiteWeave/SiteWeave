export { supportedLngs, defaultNS, lookupLocalStorage } from './constants.js';
export {
  normalizeLng,
  loadLocaleTranslation,
  loadResourcesForLng,
  loadAllLocaleResources,
  ensureLocaleLoaded,
  detectBrowserLng,
  attachLazyLocaleLoader,
} from './localeLoader.js';

/** Canonical English status values stored in the DB */
export const PROJECT_STATUS_CANONICAL = {
  planning: 'Planning',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * Normalize raw status to canonical English (for DB comparisons).
 */
export function normalizeStatusDisplay(status) {
  if (!status) return null;
  const lower = status.trim().toLowerCase();
  if (lower === 'planning') return PROJECT_STATUS_CANONICAL.planning;
  if (lower === 'in progress' || lower === 'in-progress') return PROJECT_STATUS_CANONICAL.in_progress;
  if (lower === 'on hold' || lower === 'on-hold') return PROJECT_STATUS_CANONICAL.on_hold;
  if (lower === 'completed') return PROJECT_STATUS_CANONICAL.completed;
  if (lower === 'cancelled' || lower === 'canceled') return PROJECT_STATUS_CANONICAL.cancelled;
  return status.trim();
}

const STATUS_I18N_KEYS = {
  Planning: 'project_status.planning',
  'In Progress': 'project_status.in_progress',
  'On Hold': 'project_status.on_hold',
  Completed: 'project_status.completed',
  Cancelled: 'project_status.cancelled',
};

/**
 * Localized label for display; DB values remain canonical English.
 */
export function getLocalizedProjectStatus(status, t) {
  const canonical = normalizeStatusDisplay(status);
  if (!canonical) return t('project_status.unknown');
  const key = STATUS_I18N_KEYS[canonical];
  return key ? t(key) : canonical;
}

const PRIORITY_I18N_KEYS = {
  Low: 'fieldIssues.priority_low',
  Medium: 'fieldIssues.priority_medium',
  High: 'fieldIssues.priority_high',
  Critical: 'fieldIssues.priority_critical',
};

/** Localized staff deployment status; DB values use crew deployment enum. */
export function getLocalizedContactStatus(status, t) {
  if (!status) return '';
  const keyMap = {
    assigned: 'team.deployment_assigned',
    available: 'team.deployment_available',
    off: 'team.deployment_off',
    pto: 'team.deployment_pto',
    Available: 'team.deployment_available',
    Busy: 'team.deployment_assigned',
    'On Site': 'team.deployment_assigned',
    Offline: 'team.deployment_off',
    Inactive: 'team.deployment_off',
    Unavailable: 'team.deployment_off',
    'On Leave': 'team.deployment_pto',
  };
  const key = keyMap[status];
  return key ? t(key) : status;
}

export function getLocalizedPriority(priority, t) {
  if (!priority) return '';
  const key = PRIORITY_I18N_KEYS[priority];
  return key ? t(key) : priority;
}

/** Relative time for activity/stream/comments (uses activityHistory.* keys). */
export function formatRelativeTime(dateString, t) {
  if (!dateString) return '';
  const activityDate = new Date(dateString);
  const diffInMinutes = Math.floor((Date.now() - activityDate.getTime()) / (1000 * 60));
  if (diffInMinutes < 1) return t('activityHistory.time_ago_just_now');
  if (diffInMinutes < 60) return t('activityHistory.time_ago_minutes', { count: diffInMinutes });
  if (diffInMinutes < 1440) {
    return t('activityHistory.time_ago_hours', { count: Math.floor(diffInMinutes / 60) });
  }
  return t('activityHistory.time_ago_days', { count: Math.floor(diffInMinutes / 1440) });
}

/** Locale-aware date + time for stream posts (hour and minute only, no seconds). */
export function formatStreamTimestamp(dateString, locale) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const EVENT_CATEGORY_LABEL_KEYS = {
  meeting: 'calendar.category_meeting',
  work: 'calendar.category_work',
  personal: 'calendar.category_personal',
  deadline: 'calendar.category_deadline',
  other: 'calendar.category_other',
};

/** Localized event category label; custom DB categories keep their stored name. */
export function getLocalizedEventCategoryName(category, t) {
  if (!category) return '';
  const key = EVENT_CATEGORY_LABEL_KEYS[category.id];
  return key ? t(key) : category.name;
}

/** Translate MS Project import issue/warning (key string or { key, params }). */
export function translateImportMessage(msg, t) {
  if (msg && typeof msg === 'object' && msg.key) {
    return t(msg.key, msg.params || {});
  }
  if (typeof msg === 'string' && msg.startsWith('ms_import.')) {
    return t(msg);
  }
  return typeof msg === 'string' ? msg : String(msg);
}

/** Localized progress report schedule frequency (e.g. "Weekly on Mondays"). */
export function getLocalizedFrequencyLabel(frequency, frequencyValue, t) {
  if (!frequency) return '';
  if (frequency === 'manual') return t('progressReports.frequency.manual');
  if (frequency === 'custom') return t('progressReports.frequency.custom');
  const dayKeys = [
    'day_sunday',
    'day_monday',
    'day_tuesday',
    'day_wednesday',
    'day_thursday',
    'day_friday',
    'day_saturday',
  ];
  const dayIndex =
    frequencyValue != null && frequencyValue >= 0 && frequencyValue <= 6
      ? frequencyValue
      : 0;
  const dayName = t(`progressReports.builder.${dayKeys[dayIndex]}`);
  if (frequency === 'weekly') {
    return t('progressReports.frequency.weekly_on', { dayName });
  }
  if (frequency === 'bi-weekly') {
    return t('progressReports.frequency.biweekly_on', { dayName });
  }
  if (frequency === 'monthly') {
    if (frequencyValue === 15) return t('progressReports.frequency.monthly_15th');
    if (frequencyValue === -1 || frequencyValue === 31) {
      return t('progressReports.frequency.monthly_last');
    }
    return t('progressReports.frequency.monthly_1st');
  }
  return frequency;
}
