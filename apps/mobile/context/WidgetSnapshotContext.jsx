import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { useSyncStatus } from './SyncStatusContext';
import { useNotificationCount } from './NotificationCountContext';
import { useMobileExperience } from './MobileExperienceContext';
import { patchWidgetSnapshot, clearWidgetSnapshot } from '../utils/widgetBridge';
import { WIDGET_STATES } from '../utils/widgetSnapshot';
import { HOME_SCREEN_WIDGETS_ENABLED } from '../utils/widgetFeatureFlags';

/**
 * Keeps widget snapshot sync/offline/notification fields fresh outside Home reloads.
 * No-ops while home-screen widgets are kill-switched.
 */
export function WidgetSnapshotSync() {
  const { user } = useAuth();
  const { isOnline, queueSize } = useSyncStatus();
  const { unreadCount } = useNotificationCount();
  const { mode, hydrated } = useMobileExperience();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!HOME_SCREEN_WIDGETS_ENABLED) return;

    if (!user) {
      clearWidgetSnapshot();
      return;
    }

    if (!hydrated) return;

    patchWidgetSnapshot({
      ...(!isOnline && queueSize > 0 ? { state: WIDGET_STATES.OFFLINE } : {}),
      experienceMode: mode,
      sync: {
        isOnline,
        pendingCount: queueSize,
      },
      kpis: {
        unreadNotifications: unreadCount,
      },
    });
  }, [user, isOnline, queueSize, unreadCount, mode, hydrated]);

  useEffect(() => {
    if (!HOME_SCREEN_WIDGETS_ENABLED) return undefined;

    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active' && user) {
        patchWidgetSnapshot({
          sync: {
            isOnline,
            pendingCount: queueSize,
          },
          kpis: {
            unreadNotifications: unreadCount,
          },
        });
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [user, isOnline, queueSize, unreadCount]);

  return null;
}
