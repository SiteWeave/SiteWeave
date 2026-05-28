import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getOrganizationBranding, getDefaultBranding } from '@siteweave/core-logic';
import { createTheme } from '../theme';
import { useAuth } from './AuthContext';

const BrandingContext = createContext(null);

export function BrandingProvider({ children }) {
  const { supabase, activeOrganization } = useAuth();
  const [branding, setBranding] = useState(getDefaultBranding());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const orgId = activeOrganization?.id;

    if (!supabase || !orgId) {
      setBranding(getDefaultBranding());
      return undefined;
    }

    (async () => {
      setLoading(true);
      try {
        const data = await getOrganizationBranding(supabase, orgId);
        if (!cancelled) setBranding(data);
      } catch (err) {
        console.warn('[Branding] load failed', err?.message);
        if (!cancelled) setBranding(getDefaultBranding());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, activeOrganization?.id]);

  const theme = useMemo(
    () =>
      createTheme({
        colors: {
          primary: branding.primary_color,
          secondary: branding.secondary_color,
        },
      }),
    [branding.primary_color, branding.secondary_color]
  );

  const value = useMemo(
    () => ({
      branding,
      theme,
      loading,
      primaryColor: branding.primary_color,
      secondaryColor: branding.secondary_color,
    }),
    [branding, theme, loading]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    throw new Error('useBranding must be used within BrandingProvider');
  }
  return ctx;
}
