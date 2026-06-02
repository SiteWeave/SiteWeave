import { acceptTermsOfService, hasAcceptedTermsOfService } from '@siteweave/core-logic';
import { Platform } from 'react-native';
import { TOS_VERSION } from '../constants/legal';

/**
 * Records ToS acceptance when the user has none for the current version.
 * Aligns with welcome-screen copy ("Get started" = agree to terms).
 */
export async function ensureTermsAccepted(supabase, userId) {
  if (!supabase || !userId) return false;

  const alreadyAccepted = await hasAcceptedTermsOfService(supabase, userId, TOS_VERSION);
  if (alreadyAccepted) return true;

  await acceptTermsOfService(supabase, userId, TOS_VERSION, {
    userAgent: `SiteWeave-Mobile/${Platform.OS}`,
  });
  return true;
}
