import AsyncStorage from '@react-native-async-storage/async-storage';

const LEGACY_NOTIFICATIONS_KEY = 'siteweave_notification_onboarding_done';
const NOTIFICATIONS_KEY = 'siteweave_onboarding_notifications_done';
const LOCATION_KEY = 'siteweave_onboarding_location_done';
const INVITE_DEST_KEY = 'siteweave_onboarding_invite_destination';
const SKIP_WEATHER_KEY = 'siteweave_onboarding_skip_weather';

export const GETTING_STARTED_DISMISSED_KEY = 'siteweave_getting_started_dismissed';
export const GETTING_STARTED_PROJECT_OPENED_KEY = 'siteweave_getting_started_project_opened';
export const GETTING_STARTED_WEATHER_LOGGED_KEY = 'siteweave_getting_started_weather_logged';
export const GETTING_STARTED_INVITE_SENT_KEY = 'siteweave_getting_started_invite_sent';
export const GETTING_STARTED_TASK_CREATED_KEY = 'siteweave_getting_started_task_created';
export const GETTING_STARTED_TASK_UPDATED_KEY = 'siteweave_getting_started_task_updated';

export const ONBOARDING_ROUTES = {
  PERMISSIONS: '/(auth)/permissions',
};

export function isOnboardingScreen(segment) {
  return segment === 'permissions';
}

export function isAuthSetupScreen(segment) {
  return segment === 'complete-profile';
}

export async function hasCompletedNotificationsOnboarding() {
  try {
    const [current, legacy] = await Promise.all([
      AsyncStorage.getItem(NOTIFICATIONS_KEY),
      AsyncStorage.getItem(LEGACY_NOTIFICATIONS_KEY),
    ]);
    return current === '1' || legacy === '1';
  } catch {
    return false;
  }
}

export async function hasCompletedLocationOnboarding() {
  try {
    return (await AsyncStorage.getItem(LOCATION_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markNotificationsDone() {
  await AsyncStorage.multiSet([
    [NOTIFICATIONS_KEY, '1'],
    [LEGACY_NOTIFICATIONS_KEY, '1'],
  ]);
}

export async function markLocationDone() {
  await AsyncStorage.setItem(LOCATION_KEY, '1');
}

export async function hasCompletedOnboarding({ skipWeather = false } = {}) {
  const notificationsDone = await hasCompletedNotificationsOnboarding();
  if (!notificationsDone) return false;
  if (skipWeather) return true;
  return hasCompletedLocationOnboarding();
}

export async function getNextOnboardingRoute({ skipWeather = false } = {}) {
  const notificationsDone = await hasCompletedNotificationsOnboarding();
  const locationDone = skipWeather || (await hasCompletedLocationOnboarding());
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

export async function markGettingStartedProjectOpened() {
  await AsyncStorage.setItem(GETTING_STARTED_PROJECT_OPENED_KEY, '1');
}

export async function markGettingStartedWeatherLogged() {
  await AsyncStorage.setItem(GETTING_STARTED_WEATHER_LOGGED_KEY, '1');
}

export async function markGettingStartedInviteSent() {
  await AsyncStorage.setItem(GETTING_STARTED_INVITE_SENT_KEY, '1');
}

export async function markGettingStartedTaskCreated() {
  await AsyncStorage.setItem(GETTING_STARTED_TASK_CREATED_KEY, '1');
}

export async function markGettingStartedTaskUpdated() {
  await AsyncStorage.setItem(GETTING_STARTED_TASK_UPDATED_KEY, '1');
}

export async function isGettingStartedDismissed() {
  try {
    return (await AsyncStorage.getItem(GETTING_STARTED_DISMISSED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function dismissGettingStarted() {
  await AsyncStorage.setItem(GETTING_STARTED_DISMISSED_KEY, '1');
}
