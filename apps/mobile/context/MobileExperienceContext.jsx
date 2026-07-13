import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  MOBILE_EXPERIENCE_MODES,
  defaultExperienceMode,
  loadStoredExperienceMode,
  persistExperienceMode,
  showManagerUi,
} from '../utils/mobileExperience';

const MobileExperienceContext = createContext(null);

export function MobileExperienceProvider({ children }) {
  const { hasManagerAccess, isProjectCollaborator, permissionsLoading } = useAuth();
  const [mode, setModeState] = useState(MOBILE_EXPERIENCE_MODES.FIELD);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      if (permissionsLoading) return;

      const fallback = defaultExperienceMode({ hasManagerAccess, isProjectCollaborator });
      const stored = await loadStoredExperienceMode();

      let next = fallback;
      if (stored && hasManagerAccess) {
        next = stored;
      } else if (stored === MOBILE_EXPERIENCE_MODES.FIELD) {
        next = MOBILE_EXPERIENCE_MODES.FIELD;
      }

      if (!cancelled) {
        setModeState(next);
        setHydrated(true);
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [hasManagerAccess, isProjectCollaborator, permissionsLoading]);

  useEffect(() => {
    if (!hydrated || permissionsLoading) return;
    if (!hasManagerAccess && mode === MOBILE_EXPERIENCE_MODES.MANAGER) {
      setModeState(MOBILE_EXPERIENCE_MODES.FIELD);
    }
  }, [hasManagerAccess, mode, hydrated, permissionsLoading]);

  const setMode = useCallback(
    async (nextMode) => {
      if (!hasManagerAccess) return;
      if (nextMode !== MOBILE_EXPERIENCE_MODES.FIELD && nextMode !== MOBILE_EXPERIENCE_MODES.MANAGER) {
        return;
      }
      setModeState(nextMode);
      await persistExperienceMode(nextMode);
    },
    [hasManagerAccess],
  );

  const value = useMemo(
    () => ({
      mode,
      isFieldView: mode === MOBILE_EXPERIENCE_MODES.FIELD,
      isManagerView: showManagerUi(mode, hasManagerAccess),
      canSwitchView: hasManagerAccess,
      setMode,
      hydrated: hydrated && !permissionsLoading,
    }),
    [mode, hasManagerAccess, setMode, hydrated, permissionsLoading],
  );

  return (
    <MobileExperienceContext.Provider value={value}>{children}</MobileExperienceContext.Provider>
  );
}

export function useMobileExperience() {
  const ctx = useContext(MobileExperienceContext);
  if (!ctx) {
    throw new Error('useMobileExperience must be used within MobileExperienceProvider');
  }
  return ctx;
}
