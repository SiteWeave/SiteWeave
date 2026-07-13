import { normalizeStatusDisplay } from '@siteweave/i18n';
import { daysFromDueToToday } from './myDay';
import { colors } from '../theme';

export const SCHEDULE_HEALTH = {
  on_track: 'on_track',
  at_risk: 'at_risk',
  overdue: 'overdue',
  completed: 'completed',
};

const ACCENT_COLORS = {
  [SCHEDULE_HEALTH.on_track]: colors.secondary,
  [SCHEDULE_HEALTH.at_risk]: colors.statusWorking,
  [SCHEDULE_HEALTH.overdue]: colors.statusStuck,
  [SCHEDULE_HEALTH.completed]: colors.statusDone,
};

/**
 * Schedule health from progress vs due date (aligned with web ProjectProgressCard logic).
 */
export function getProjectScheduleHealth(project, progress = 0) {
  const pct = Math.round(Number(progress) || 0);
  const status = normalizeStatusDisplay(project?.status);

  if (status === 'Completed' || pct >= 100) {
    return SCHEDULE_HEALTH.completed;
  }

  const dueDate = project?.due_date;
  if (!dueDate) {
    return SCHEDULE_HEALTH.on_track;
  }

  const overdueOffset = daysFromDueToToday(dueDate);
  if (overdueOffset == null) {
    return SCHEDULE_HEALTH.on_track;
  }

  if (overdueOffset > 0 && pct < 100) {
    return SCHEDULE_HEALTH.overdue;
  }

  if (overdueOffset === 0 && pct < 100) {
    return SCHEDULE_HEALTH.at_risk;
  }

  const daysLeft = -overdueOffset;
  if (daysLeft <= 7 && pct < 75) {
    return SCHEDULE_HEALTH.at_risk;
  }

  return SCHEDULE_HEALTH.on_track;
}

export function getScheduleHealthAccentColor(health) {
  return ACCENT_COLORS[health] || colors.primary;
}

export function getMilestoneLabel(project) {
  const milestone = project?.next_milestone;
  if (!milestone) return null;
  if (typeof milestone === 'string') return milestone.trim() || null;
  return milestone.name || milestone.title || null;
}

/**
 * Relative due phrase for list cards (mobile-first).
 */
export function getRelativeDuePhrase(dueDate, t, language = 'en') {
  if (!dueDate) return null;

  const offset = daysFromDueToToday(dueDate);
  if (offset == null) return null;

  if (offset > 0) {
    return offset === 1
      ? t('mobile.project_card.overdue_one')
      : t('mobile.project_card.overdue_days', { count: offset });
  }

  if (offset === 0) {
    return t('mobile.project_card.due_today');
  }

  const daysLeft = -offset;
  if (daysLeft <= 7) {
    const due = new Date(`${dueDate}T12:00:00`);
    const weekday = due.toLocaleDateString(language, { weekday: 'long' });
    return t('mobile.project_card.due_on', { date: weekday });
  }

  return t('mobile.project_card.due_in_days', { count: daysLeft });
}

const PROJECT_TYPE_ICONS = {
  Residential: 'home-outline',
  Commercial: 'business-outline',
  Industrial: 'construct-outline',
  Infrastructure: 'trail-sign-outline',
  Other: 'layers-outline',
};

export function getProjectTypeIcon(projectType) {
  if (!projectType) return 'briefcase-outline';
  return PROJECT_TYPE_ICONS[projectType] || 'briefcase-outline';
}

const STATUS_PILL = {
  Planning: { backgroundColor: '#DBEAFE', color: '#1E40AF' },
  'In Progress': { backgroundColor: '#D1FAE5', color: '#065F46' },
  'On Hold': { backgroundColor: '#FEF3C7', color: '#92400E' },
  Completed: { backgroundColor: '#F3F4F6', color: '#374151' },
  Cancelled: { backgroundColor: '#F3F4F6', color: '#6B7280' },
};

export function getStatusPillStyle(status) {
  const canonical = normalizeStatusDisplay(status);
  return STATUS_PILL[canonical] || { backgroundColor: '#F3F4F6', color: '#374151' };
}
