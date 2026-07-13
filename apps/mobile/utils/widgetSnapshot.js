/**
 * Shared widget snapshot contract for iOS WidgetKit and Android home-screen widgets.
 * Widgets read a JSON snapshot written by the main app — they cannot call Supabase directly.
 */

import { buildMyDayItems, daysFromDueToToday } from './myDay.js';

const MOBILE_EXPERIENCE_MODES = {
  FIELD: 'field',
  MANAGER: 'manager',
};

export const WIDGET_SNAPSHOT_VERSION = 1;
export const WIDGET_STORAGE_KEY = 'siteweave_widget_snapshot_v1';

export const WIDGET_STATES = {
  READY: 'ready',
  LOGGED_OUT: 'logged_out',
  EMPTY: 'empty',
  OFFLINE: 'offline',
};

const PRECIP_RISK_THRESHOLD = 15;

function formatEventTime(isoStart) {
  if (!isoStart) return null;
  const date = new Date(isoStart);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatTaskStatus(task, today = new Date()) {
  const offset = daysFromDueToToday(task?.due_date, today);
  if (offset === 0) return 'due_today';
  if (offset != null && offset > 0) return `overdue_${offset}d`;
  if (offset != null && offset < 0) return 'upcoming';
  return 'open';
}

function formatTaskStatusLabel(status) {
  if (status === 'due_today') return 'due';
  const match = /^overdue_(\d+)d$/.exec(status || '');
  if (match) {
    const days = Number(match[1]);
    return days === 1 ? '1d late' : `${days}d late`;
  }
  return null;
}

export function computeWeatherRiskLevel(precipPct) {
  if (precipPct == null || precipPct < PRECIP_RISK_THRESHOLD) return 'low';
  if (precipPct >= 60) return 'high';
  return 'medium';
}

export function countDueTodayTasks(tasks = [], today = new Date()) {
  return tasks.filter((task) => {
    if (!task || task.completed) return false;
    return daysFromDueToToday(task.due_date, today) === 0;
  }).length;
}

export function mapMyDayItemForWidget(item, today = new Date()) {
  if (!item) return null;
  if (item.type === 'event') {
    return {
      type: 'event',
      id: String(item.id),
      title: item.title || item.name || 'Event',
      time: formatEventTime(item.start_time),
      projectId: item.project_id ? String(item.project_id) : null,
      deepLink: 'siteweave:///(tabs)/calendar',
    };
  }

  const status = formatTaskStatus(item, today);
  const projectId = item.project_id ? String(item.project_id) : null;
  const taskId = item.id ? String(item.id) : null;

  return {
    type: 'task',
    id: taskId,
    title: item.title || item.name || 'Task',
    status,
    statusLabel: formatTaskStatusLabel(status),
    projectId,
    deepLink: projectId && taskId
      ? `siteweave:///(tabs)/projects/${projectId}?task=${taskId}`
      : 'siteweave:///(tabs)',
  };
}

export function resolvePinnedProject(projects = [], pinnedProjectId = null) {
  if (!projects?.length) return null;
  if (pinnedProjectId) {
    const pinned = projects.find((p) => String(p.id) === String(pinnedProjectId));
    if (pinned) return pinned;
  }
  return projects[0];
}

export function buildWidgetSnapshot({
  state = WIDGET_STATES.READY,
  locale = 'en',
  experienceMode = MOBILE_EXPERIENCE_MODES.FIELD,
  sync = { isOnline: true, pendingCount: 0 },
  kpis = { dueToday: 0, overdue: 0, unreadNotifications: 0, activeProjects: null, completedTasks: null },
  weather = null,
  pinnedProject = null,
  tasks = [],
  events = [],
  myDayLimit = 3,
  primaryColor = '#3B82F6',
  deepLink = 'siteweave:///(tabs)',
  updatedAt = new Date().toISOString(),
} = {}) {
  const today = new Date();
  const myDaySource = buildMyDayItems({
    tasks,
    events,
    limit: myDayLimit,
    maxOverdueDays: 7,
  });

  const myDay = myDaySource
    .map((item) => mapMyDayItemForWidget(item, today))
    .filter(Boolean);

  const dueToday = kpis.dueToday ?? countDueTodayTasks(tasks, today);
  const overdue = kpis.overdue ?? 0;
  const unreadNotifications = kpis.unreadNotifications ?? 0;

  let resolvedState = state;
  if (resolvedState === WIDGET_STATES.READY && myDay.length === 0 && dueToday === 0 && overdue === 0) {
    resolvedState = WIDGET_STATES.EMPTY;
  }
  if (!sync?.isOnline && (sync?.pendingCount ?? 0) > 0) {
    resolvedState = WIDGET_STATES.OFFLINE;
  }

  const weatherPayload = weather
    ? {
        tempF: weather.tempF ?? weather.temperature ?? null,
        condition: weather.condition ?? null,
        precipPct: weather.precipPct ?? weather.precipProbability ?? null,
        locationLabel: weather.locationLabel ?? null,
        riskLevel: weather.riskLevel ?? computeWeatherRiskLevel(weather.precipPct ?? weather.precipProbability),
        icon: weather.icon ?? null,
      }
    : null;

  const pinned = pinnedProject
    ? {
        id: String(pinnedProject.id),
        name: pinnedProject.name || pinnedProject.title || 'Project',
        progressPct: Math.round(Number(pinnedProject.progress ?? pinnedProject.progress_pct ?? 0)),
      }
    : null;

  const isManager = experienceMode === MOBILE_EXPERIENCE_MODES.MANAGER;

  return {
    version: WIDGET_SNAPSHOT_VERSION,
    updatedAt,
    locale,
    state: resolvedState,
    experienceMode,
    sync: {
      isOnline: sync?.isOnline !== false,
      pendingCount: sync?.pendingCount ?? 0,
    },
    kpis: {
      dueToday,
      overdue,
      unreadNotifications,
      activeProjects: kpis.activeProjects ?? null,
      completedTasks: kpis.completedTasks ?? null,
    },
    weather: weatherPayload,
    pinnedProject: pinned,
    myDay: isManager ? myDay.slice(0, 2) : myDay,
    managerKpis: isManager
      ? {
          activeProjects: kpis.activeProjects ?? null,
          completedTasks: kpis.completedTasks ?? null,
          overdueTasks: overdue,
        }
      : null,
    primaryColor,
    deepLink,
  };
}

export function buildLoggedOutWidgetSnapshot() {
  return buildWidgetSnapshot({
    state: WIDGET_STATES.LOGGED_OUT,
    tasks: [],
    events: [],
    kpis: { dueToday: 0, overdue: 0, unreadNotifications: 0 },
    weather: null,
    pinnedProject: null,
    deepLink: 'siteweave:///(auth)/login',
  });
}

export function mergeWidgetSnapshots(base, patch) {
  if (!base) return patch;
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    sync: { ...base.sync, ...(patch.sync || {}) },
    kpis: { ...base.kpis, ...(patch.kpis || {}) },
    weather: patch.weather === undefined ? base.weather : patch.weather,
    pinnedProject: patch.pinnedProject === undefined ? base.pinnedProject : patch.pinnedProject,
    myDay: patch.myDay === undefined ? base.myDay : patch.myDay,
    managerKpis: patch.managerKpis === undefined ? base.managerKpis : patch.managerKpis,
    updatedAt: patch.updatedAt || new Date().toISOString(),
  };
}

export function formatWidgetStaleLabel(updatedAt, now = Date.now()) {
  if (!updatedAt) return null;
  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return null;
  const minutes = Math.max(1, Math.round((now - ts) / 60000));
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.round(hours / 24)}d ago`;
}
