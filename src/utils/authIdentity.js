/**
 * Helpers for Supabase Auth identity providers (email/password vs OAuth).
 */

export function userHasEmailPassword(user) {
  const identities = user?.identities;
  if (Array.isArray(identities) && identities.length > 0) {
    return identities.some((i) => i.provider === 'email');
  }
  // Legacy sessions may only expose app_metadata
  const providers = user?.app_metadata?.providers;
  if (Array.isArray(providers)) {
    return providers.includes('email');
  }
  return false;
}

export function getOAuthProviderLabels(user) {
  const identities = user?.identities;
  if (Array.isArray(identities) && identities.length > 0) {
    return identities
      .filter((i) => i.provider && i.provider !== 'email')
      .map((i) => (i.provider === 'azure' ? 'Microsoft' : capitalize(i.provider)));
  }
  return [];
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
