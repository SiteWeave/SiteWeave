import AsyncStorage from '@react-native-async-storage/async-storage';

const LEGACY_NOTIFICATIONS_KEY = 'siteweave_notification_onboarding_done';
const NOTIFICATIONS_KEY = 'siteweave_onboarding_notifications_done';
const LOCATION_KEY = 'siteweave_onboarding_location_done';
const INVITE_DEST_KEY = 'siteweave_onboarding_invite_destination';
const SKIP_WEATHER_KEY = 'siteweave_onboarding_skip_weather';

const GETTING_STARTED_DISMISSED = 'siteweave_getting_started_dismissed';
const GETTING_STARTED_PROJECT_OPENED = 'siteweave_getting_started_project_opened';
const GETTING_STARTED_WEATHER_LOGGED = 'siteweave_getting_started_weather_logged';
const GETTING_STARTED_INVITE_SENT = 'siteweave_getting_started_invite_sent';
const GETTING_STARTED_TASK_CREATED = 'siteweave_getting_started_task_created';
const GETTING_STARTED_TASK_UPDATED = 'siteweave_getting_started_task_updated';

/** @deprecated Use user-scoped helpers — kept for older imports. */
export const GETTING_STARTED_DISMISSED_KEY = GETTING_STARTED_DISMISSED;
/** @deprecated */
export const GETTING_STARTED_PROJECT_OPENED_KEY = GETTING_STARTED_PROJECT_OPENED;
/** @deprecated */
export const GETTING_STARTED_WEATHER_LOGGED_KEY = GETTING_STARTED_WEATHER_LOGGED;
/** @deprecated */
export const GETTING_STARTED_INVITE_SENT_KEY = GETTING_STARTED_INVITE_SENT;
/** @deprecated */
export const GETTING_STARTED_TASK_CREATED_KEY = GETTING_STARTED_TASK_CREATED;
/** @deprecated */
export const GETTING_STARTED_TASK_UPDATED_KEY = GETTING_STARTED_TASK_UPDATED;

export const ONBOARDING_ROUTES = {
  PERMISSIONS: '/(auth)/permissions',
};

function scopedKey(base, userId) {
  if (!userId) return base;
  return `${base}:${userId}`;
}

export function isOnboardingScreen(segment) {
  return segment === 'permissions';
}

export function isAuthSetupScreen(segment) {
  return segment === 'complete-profile';
}

export async function hasCompletedNotificationsOnboarding(userId) {
  if (!userId) return false;
  try {
    return (await AsyncStorage.getItem(scopedKey(NOTIFICATIONS_KEY, userId))) === '1';
  } catch {
    return false;
  }
}

export async function hasCompletedLocationOnboarding(userId) {
  if (!userId) return false;
  try {
    return (await AsyncStorage.getItem(scopedKey(LOCATION_KEY, userId))) === '1';
  } catch {
    return false;
  }
}

export async function markNotificationsDone(userId) {
  if (!userId) return;
  await AsyncStorage.setItem(scopedKey(NOTIFICATIONS_KEY, userId), '1');
}

export async function markLocationDone(userId) {
  if (!userId) return;
  await AsyncStorage.setItem(scopedKey(LOCATION_KEY, userId), '1');
}

export async function hasCompletedOnboarding({ userId, skipWeather = false } = {}) {
  const notificationsDone = await hasCompletedNotificationsOnboarding(userId);
  if (!notificationsDone) return false;
  if (skipWeather) return true;
  return hasCompletedLocationOnboarding(userId);
}

export async function getNextOnboardingRoute({ userId, skipWeather = false } = {}) {
  const notificationsDone = await hasCompletedNotificationsOnboarding(userId);
  const locationDone = skipWeather || (await hasCompletedLocationOnboarding(userId));
  if (notificationsDone && locationDone) {
    return null;
  }
  return ONBOARDING_ROUTES.PERMISSIONS;
}

export async function setPendingInviteOnboarding({ inviteDestination, skipWeather = false } = {}) {
  const ops = [];
  if (inviteDestination) {
    ops.push([INVITE_DEST_KEY, inviteDestination]);
  }
  if (skipWeather) {
    ops.push([SKIP_WEATHER_KEY, '1']);
  }
  if (ops.length > 0) {
    await AsyncStorage.multiSet(ops);
  }
}

export async function getPendingInviteOnboarding() {
  try {
    const [inviteDestination, skipWeather] = await Promise.all([
      AsyncStorage.getItem(INVITE_DEST_KEY),
      AsyncStorage.getItem(SKIP_WEATHER_KEY),
    ]);
    return {
      inviteDestination,
      skipWeather: skipWeather === '1',
    };
  } catch {
    return { inviteDestination: null, skipWeather: false };
  }
}

export async function clearPendingInviteOnboarding() {
  await AsyncStorage.multiRemove([INVITE_DEST_KEY, SKIP_WEATHER_KEY]);
}

export async function markGettingStartedProjectOpened(userId) {
  if (!userId) return;
  await AsyncStorage.setItem(scopedKey(GETTING_STARTED_PROJECT_OPENED, userId), '1');
}

export async function markGettingStartedWeatherLogged(userId) {
  if (!userId) return;
  await AsyncStorage.setItem(scopedKey(GETTING_STARTED_WEATHER_LOGGED, userId), '1');
}

export async function markGettingStartedInviteSent(userId) {
  if (!userId) return;
  await AsyncStorage.setItem(scopedKey(GETTING_STARTED_INVITE_SENT, userId), '1');
}

export async function markGettingStartedTaskCreated(userId) {
  if (!userId) return;
  await AsyncStorage.setItem(scopedKey(GETTING_STARTED_TASK_CREATED, userId), '1');
}

export async function markGettingStartedTaskUpdated(userId) {
  if (!userId) return;
  await AsyncStorage.setItem(scopedKey(GETTING_STARTED_TASK_UPDATED, userId), '1');
}

export async function isGettingStartedDismissed(userId) {
  if (!userId) return false;
  try {
    return (await AsyncStorage.getItem(scopedKey(GETTING_STARTED_DISMISSED, userId))) === '1';
  } catch {
    return false;
  }
}

export async function dismissGettingStarted(userId) {
  if (!userId) return;
  await AsyncStorage.setItem(scopedKey(GETTING_STARTED_DISMISSED, userId), '1');
}

export async function showGettingStarted(userId) {
  if (!userId) return;
  await AsyncStorage.removeItem(scopedKey(GETTING_STARTED_DISMISSED, userId));
}

export async function readGettingStartedState(userId) {
  if (!userId) {
    return {
      dismissed: false,
      projectOpened: false,
      inviteSent: false,
      taskCreated: false,
      taskUpdated: false,
    };
  }
  const [dismissed, projectOpened, inviteSent, taskCreated, taskUpdated] = await Promise.all([
    AsyncStorage.getItem(scopedKey(GETTING_STARTED_DISMISSED, userId)),
    AsyncStorage.getItem(scopedKey(GETTING_STARTED_PROJECT_OPENED, userId)),
    AsyncStorage.getItem(scopedKey(GETTING_STARTED_INVITE_SENT, userId)),
    AsyncStorage.getItem(scopedKey(GETTING_STARTED_TASK_CREATED, userId)),
    AsyncStorage.getItem(scopedKey(GETTING_STARTED_TASK_UPDATED, userId)),
  ]);
  return {
    dismissed: dismissed === '1',
    projectOpened: projectOpened === '1',
    inviteSent: inviteSent === '1',
    taskCreated: taskCreated === '1',
    taskUpdated: taskUpdated === '1',
  };
}

/** Removes obsolete device-global flags so they cannot leak across accounts. */
export async function clearLegacyDeviceOnboardingFlags() {
  try {
    await AsyncStorage.multiRemove([
      LEGACY_NOTIFICATIONS_KEY,
      NOTIFICATIONS_KEY,
      LOCATION_KEY,
      GETTING_STARTED_DISMISSED,
      GETTING_STARTED_PROJECT_OPENED,
      GETTING_STARTED_WEATHER_LOGGED,
      GETTING_STARTED_INVITE_SENT,
      GETTING_STARTED_TASK_CREATED,
      GETTING_STARTED_TASK_UPDATED,
    ]);
  } catch {
    // ignore
  }
}
