import { useEffect, useState } from 'react';

/**
 * Resolves an org's brand primary color for onboarding accents.
 * Branding is stored in `organization_branding` (not on `organizations`),
 * so callers inject a loader: (organizationId) => Promise<string | null>.
 */
export function useBrandingPrimaryColor(loadColor, organizationId, fallback = '#3B82F6') {
  const [color, setColor] = useState(fallback);

  useEffect(() => {
    if (!organizationId || typeof loadColor !== 'function') {
      setColor(fallback);
      return undefined;
    }

    let cancelled = false;
    Promise.resolve(loadColor(organizationId))
      .then((resolved) => {
        if (!cancelled && resolved) setColor(resolved);
      })
      .catch(() => {
        /* keep fallback */
      });

    return () => {
      cancelled = true;
    };
  }, [loadColor, organizationId, fallback]);

  return color;
}
