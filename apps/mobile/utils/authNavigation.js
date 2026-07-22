import {
  getNextOnboardingRoute,
  setPendingInviteOnboarding,
  getPendingInviteOnboarding,
  clearPendingInviteOnboarding,
} from './onboarding';
import {
  hasPendingSignupProfileSetup,
  needsProfileCompletion,
  setPendingSignupProfileSetup,
} from './authProfile';

/** After successful sign-in, route to onboarding or main tabs. */
export async function routeAfterAuth(router, { inviteDestination, skipWeather, fromSignup = false, user } = {}) {
  if (inviteDestination || skipWeather) {
    await setPendingInviteOnboarding({ inviteDestination, skipWeather });
  }

  if (fromSignup) {
    await setPendingSignupProfileSetup(true);
  }

  const pendingSignupProfile = fromSignup || (await hasPendingSignupProfileSetup());
  if (pendingSignupProfile) {
    router.replace('/(auth)/complete-profile?fromSignup=1');
    return;
  }

  if (user && needsProfileCompletion(user)) {
    router.replace('/(auth)/complete-profile');
    return;
  }

  const pending = await getPendingInviteOnboarding();
  const next = await getNextOnboardingRoute({
    userId: user?.id,
    skipWeather: pending.skipWeather,
  });

  if (next) {
    router.replace(next);
    return;
  }

  const destination = pending.inviteDestination ?? '/(tabs)';
  await clearPendingInviteOnboarding();
  router.replace(destination);
}
