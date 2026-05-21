/**
 * Push Notification Service
 * Handles push notification setup, permissions, and token registration
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Check if Device is available (may not be in all environments)
const isDeviceAvailable = Device && typeof Device.isDevice !== 'undefined';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions
 * @returns {Promise<boolean>} True if permissions granted
 */
export async function requestNotificationPermissions() {
  if (!isDeviceAvailable || !Device.isDevice) {
    console.warn('Must use physical device for Push Notifications');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Failed to get push token for push notification!');
    return false;
  }

  return true;
}

/**
 * Get push notification token
 * @returns {Promise<string|null>} Push token or null if unavailable
 */
export async function getPushToken() {
  try {
    if (!isDeviceAvailable || !Device.isDevice) {
      console.warn('Must use physical device for Push Notifications');
      return null;
    }

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '0e8aedb2-5084-4046-a750-5032e61afd9a',
    });

    return tokenData.data;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

/**
 * Register push token with backend
 * @param {Object} supabase - Supabase client
 * @param {string} userId - User ID
 * @param {string} token - Push token
 */
export async function registerPushToken(supabase, userId, token) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', userId);

    if (error) {
      // If column doesn't exist, log warning but don't throw
      if (error.message?.includes('column') && error.message?.includes('push_token')) {
        console.warn('push_token column not found. Run scripts/add-push-token-column.sql to add it.');
        return;
      }
      console.error('Error registering push token:', error);
      throw error;
    }

    console.log('Push token registered successfully');
  } catch (error) {
    console.error('Error in registerPushToken:', error);
    // Don't throw - allow app to continue even if push token registration fails
  }
}

/**
 * Parse a push payload into an in-app route path.
 * Supports explicit route payloads and fallback project deep links.
 * @param {Object} data
 * @returns {string|null}
 */
export function resolveNotificationRoute(data = {}) {
  if (!data || typeof data !== 'object') return null;

  if (typeof data.screen === 'string' && data.screen.trim()) {
    return data.screen.startsWith('/') ? data.screen : `/${data.screen}`;
  }

  if (typeof data.route === 'string' && data.route.trim()) {
    return data.route.startsWith('/') ? data.route : `/${data.route}`;
  }

  if (typeof data.action_url === 'string' && data.action_url.trim()) {
    const u = data.action_url.trim();
    if (u.startsWith('http://') || u.startsWith('https://')) {
      return u;
    }
  }

  if (data.project_id) {
    if (data.source_type === 'stream_post' || (typeof data.screen === 'string' && data.screen.includes('/stream'))) {
      return `/projects/${data.project_id}`;
    }
    return `/projects/${data.project_id}`;
  }

  if (typeof data.action_url === 'string' && data.action_url.includes('project=')) {
    try {
      const url = new URL(data.action_url);
      const projectId = url.searchParams.get('project');
      if (projectId) {
        return `/projects/${projectId}`;
      }
    } catch {
      // Ignore malformed URL and continue fallback routing.
    }
  }

  return '/notifications';
}

/**
 * Fetch notification center rows for current user.
 * @param {Object} supabase
 * @param {{ userId?: string, email?: string, limit?: number }} options
 */
export async function fetchUserNotifications(supabase, options = {}) {
  const { userId, email, limit = 100 } = options;

  let query = supabase
    .from('user_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.or(`recipient_user_id.eq.${userId},recipient_email.eq.${email || ''}`);
  } else if (email) {
    query = query.eq('recipient_email', email);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Fetch unread count for user notifications.
 * @param {Object} supabase
 * @param {{ userId?: string, email?: string }} options
 * @returns {Promise<number>}
 */
export async function fetchUnreadNotificationCount(supabase, options = {}) {
  const { userId, email } = options;
  let query = supabase
    .from('user_notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);

  if (userId) {
    query = query.or(`recipient_user_id.eq.${userId},recipient_email.eq.${email || ''}`);
  } else if (email) {
    query = query.eq('recipient_email', email);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

/**
 * Mark a notification as read and log action.
 * @param {Object} supabase
 * @param {{ notificationId: string, userId?: string }} options
 */
export async function markNotificationRead(supabase, options = {}) {
  const { notificationId, userId } = options;
  if (!notificationId) return;

  // Use edge function so action history stays consistent with web/desktop.
  await supabase.functions.invoke('dispatch-notification', {
    body: {
      action: 'notification_action',
      notificationId,
      userId,
      actionType: 'mark_read',
    },
  });
}

/**
 * Acknowledge notification without navigating away.
 * @param {Object} supabase
 * @param {{ notificationId: string, userId?: string }} options
 */
export async function acknowledgeNotification(supabase, options = {}) {
  const { notificationId, userId } = options;
  if (!notificationId) return;

  await supabase.functions.invoke('dispatch-notification', {
    body: {
      action: 'notification_action',
      notificationId,
      userId,
      actionType: 'acknowledge',
    },
  });
}

/**
 * Setup notification listeners
 * @param {Function} onNotificationReceived - Callback when notification received
 * @param {Function} onNotificationTapped - Callback when notification tapped
 * @returns {Function} Cleanup function
 */
/**
 * When a new user_notification row arrives (from stream/task edge fn), show a local banner in foreground.
 * Push still delivered via Expo when app is backgrounded.
 */
export function subscribeUserNotificationInserts(supabase, userId, userEmail) {
  if (!supabase || !userId) return () => {};

  const channel = supabase
    .channel(`user_notifications_push:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'user_notifications' },
      async (payload) => {
        const row = payload.new;
        if (!row) return;
        if (row.recipient_user_id && row.recipient_user_id !== userId) return;
        if (
          !row.recipient_user_id &&
          userEmail &&
          row.recipient_email &&
          row.recipient_email.toLowerCase() !== userEmail.toLowerCase()
        ) {
          return;
        }
        await scheduleLocalNotification(row.title || 'SiteWeave', row.body || '', {
          project_id: row.project_id,
          screen: row.metadata?.screen,
          source_type: row.source_type,
          task_id: row.metadata?.task_id,
        });
      },
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function setupNotificationListeners(onNotificationReceived, onNotificationTapped) {
  // Listener for notifications received while app is foregrounded
  const receivedListener = Notifications.addNotificationReceivedListener(notification => {
    if (onNotificationReceived) {
      onNotificationReceived(notification);
    }
  });

  // Listener for when user taps on notification
  const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
    if (onNotificationTapped) {
      onNotificationTapped(response);
    }
  });

  // Return cleanup function
  return () => {
    Notifications.removeNotificationSubscription(receivedListener);
    Notifications.removeNotificationSubscription(responseListener);
  };
}

/**
 * Returns route from the most recent tapped notification if available.
 * Useful for cold starts.
 */
export async function getLastNotificationRoute() {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    const data = response?.notification?.request?.content?.data || {};
    return resolveNotificationRoute(data);
  } catch (error) {
    console.error('Error getting last notification route:', error);
    return null;
  }
}

/**
 * Schedule a local notification (for testing)
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Additional data
 */
export async function scheduleLocalNotification(title, body, data = {}) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: null, // Show immediately
  });
}
