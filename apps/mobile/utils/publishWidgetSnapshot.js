import {
  buildWidgetSnapshot,
  WIDGET_STATES,
} from './widgetSnapshot';
import { writeWidgetSnapshot, patchWidgetSnapshot } from './widgetBridge';
import { getPinnedProjectId } from './widgetPreferences';
import { resolvePinnedProject } from './widgetSnapshot';

export async function publishHomeWidgetSnapshot({
  tasks = [],
  events = [],
  projects = [],
  kpis = {},
  weather = null,
  locale = 'en',
  experienceMode = 'field',
  primaryColor = '#3B82F6',
  sync = { isOnline: true, pendingCount: 0 },
  unreadNotifications = 0,
}) {
  const pinnedProjectId = await getPinnedProjectId();
  const pinnedProject = resolvePinnedProject(projects, pinnedProjectId);

  const snapshot = buildWidgetSnapshot({
    state: WIDGET_STATES.READY,
    locale,
    experienceMode,
    sync,
    kpis: {
      dueToday: kpis.dueToday,
      overdue: kpis.overdueTasks ?? kpis.overdue ?? 0,
      unreadNotifications,
      activeProjects: kpis.activeProjects ?? null,
      completedTasks: kpis.completedTasks ?? null,
    },
    weather,
    pinnedProject,
    tasks,
    events,
    primaryColor,
    deepLink: 'siteweave:///(tabs)',
  });

  await writeWidgetSnapshot(snapshot);
  if (__DEV__) {
    console.log('[widget] snapshot updated', snapshot.state, snapshot.myDay?.length ?? 0);
  }
  return snapshot;
}

export async function publishWeatherWidgetPatch(weather) {
  if (!weather) return null;
  return patchWidgetSnapshot({
    weather: {
      tempF: weather.temperature,
      condition: weather.condition,
      precipPct: weather.precipProbability,
      locationLabel: weather.locationLabel,
      icon: weather.icon,
    },
  });
}
