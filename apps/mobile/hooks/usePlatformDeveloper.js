import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

/** SiteWeave platform developer (profiles.is_super_admin) — not org admin. */
export function usePlatformDeveloper() {
  const { user, supabase } = useAuth();
  const [isPlatformDeveloper, setIsPlatformDeveloper] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user || !supabase) {
      setIsPlatformDeveloper(false);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('id', user.id)
        .maybeSingle();

      setIsPlatformDeveloper(!error && data?.is_super_admin === true);
    } catch {
      setIsPlatformDeveloper(false);
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { isPlatformDeveloper, loading, refresh };
}
