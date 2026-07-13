import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchUnreadNotificationCount } from '../utils/notifications';

const NotificationCountContext = createContext({
  unreadCount: 0,
  refreshUnreadCount: () => {},
});

export function NotificationCountProvider({ children }) {
  const { user, supabase } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    if (!user || !supabase) {
      setUnreadCount(0);
      return;
    }
    try {
      const count = await fetchUnreadNotificationCount(supabase, {
        userId: user.id,
        email: user.email || '',
      });
      setUnreadCount(count);
    } catch {
      setUnreadCount(0);
    }
  }, [user, supabase]);

  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  return (
    <NotificationCountContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </NotificationCountContext.Provider>
  );
}

export function useNotificationCount() {
  return useContext(NotificationCountContext);
}
