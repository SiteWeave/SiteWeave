import { hasCompletedNotificationOnboarding } from '../app/(auth)/notification-permission';

/** After successful sign-in, route to onboarding or main tabs. */
export async function routeAfterAuth(router) {
  const done = await hasCompletedNotificationOnboarding();
  if (done) {
    router.replace('/(tabs)');
  } else {
    router.replace('/(auth)/notification-permission');
  }
}
