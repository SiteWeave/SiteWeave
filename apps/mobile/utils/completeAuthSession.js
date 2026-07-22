import { routeAfterAuth } from './authNavigation';

/** Shared post-auth bootstrap: org load, pending invite redemption, then route. */
export async function finalizeAuthSession({
  supabase,
  loadUserOrganization,
  router,
  haptics,
  fromSignup = false,
}) {
  await new Promise((r) => setTimeout(r, 300));
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  let inviteDestination = null;
  let skipWeather = false;

  // Redeem before org load so bootstrap cannot consume the token without returning a destination.
  try {
    const {
      peekPendingProjectInviteToken,
      consumePendingProjectInviteToken,
      redeemProjectInvite,
    } = await import('./workspaceClient');
    const pendingToken = await peekPendingProjectInviteToken();
    if (pendingToken && supabase) {
      const result = await redeemProjectInvite(supabase, { token: pendingToken });
      if (result?.success) {
        await consumePendingProjectInviteToken();
        if (result.projectId) {
          inviteDestination = `/(tabs)/projects/${result.projectId}`;
          skipWeather = true;
        }
      }
    }
  } catch (error) {
    console.warn('Could not redeem pending project invite:', error?.message || error);
  }

  await loadUserOrganization(currentUser);
  await new Promise((r) => setTimeout(r, 200));

  haptics?.success?.();
  await routeAfterAuth(router, {
    inviteDestination,
    skipWeather,
    fromSignup,
    user: currentUser,
  });
}
