import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import PressableWithFade from '../../components/PressableWithFade';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { colors, spacing, touch } from '../../theme';
import { scrollBottomPadding, contentTopInset } from '../../utils/layoutInsets';
import { useNotificationCount } from '../../context/NotificationCountContext';
import {
  fetchUserNotifications,
  markNotificationRead,
  markNotificationUnread,
  resolveNotificationRoute,
} from '../../utils/notifications';
import { getCached, setCached } from '../../utils/persistentCache';
import { SkeletonList } from '../../components/ui/Skeleton';

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const { user, supabase } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refreshUnreadCount } = useNotificationCount();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!supabase || !user) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const cacheResource = 'notifications';
      const cached = await getCached(user.id, cacheResource);
      if (cached?.length) {
        setNotifications(cached);
        setLoading(false);
      }
      const data = await fetchUserNotifications(supabase, {
        userId: user.id,
        email: user.email || '',
      });
      setNotifications(data);
      await setCached(user.id, cacheResource, data);
    } catch (error) {
      console.error('Error loading notifications:', error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, user]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
      refreshUnreadCount();
    }, [loadNotifications, refreshUnreadCount]),
  );

  const handleOpenNotification = async (item) => {
    try {
      if (!item.read_at) {
        await markNotificationRead(supabase, { notificationId: item.id, userId: user?.id });
        refreshUnreadCount();
      }
    } catch (error) {
      console.error('Error marking notification read:', error);
    }

    const route = resolveNotificationRoute({
      ...item.metadata,
      project_id: item.project_id,
      source_type: item.source_type,
      event_id: item.metadata?.event_id,
      screen: item.metadata?.screen,
      route: item.metadata?.route,
    });
    if (route && (route.startsWith('http://') || route.startsWith('https://'))) {
      await Linking.openURL(route);
      return;
    }
    router.push(route || '/(tabs)');
  };

  const handleToggleRead = async (item) => {
    const prev = notifications;
    const isUnread = !item.read_at;
    if (isUnread) {
      setNotifications((list) =>
        list.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)),
      );
      try {
        await markNotificationRead(supabase, { notificationId: item.id, userId: user?.id });
        refreshUnreadCount();
      } catch (error) {
        console.error('Error marking notification read:', error);
        setNotifications(prev);
      }
      return;
    }
    setNotifications((list) =>
      list.map((n) => (n.id === item.id ? { ...n, read_at: null } : n)),
    );
    try {
      await markNotificationUnread(supabase, { notificationId: item.id, userId: user?.id });
      refreshUnreadCount();
    } catch (error) {
      console.error('Error marking notification unread:', error);
      setNotifications(prev);
    }
  };

  const renderNotification = ({ item }) => {
    const isUnread = !item.read_at;
    return (
      <View style={[styles.card, isUnread && styles.cardUnread]}>
        <View style={styles.cardRow}>
          <View style={styles.cardContent}>
            <PressableWithFade
              style={styles.cardContentPressable}
              onPress={() => handleOpenNotification(item)}
              static
            >
              <View style={styles.cardHeader}>
                <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                {isUnread ? <View style={styles.unreadDot} /> : null}
              </View>
              <Text style={styles.body} numberOfLines={3}>{item.body}</Text>
              <Text style={styles.time}>
                {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
              </Text>
            </PressableWithFade>
          </View>
          <PressableWithFade
            style={styles.actionButton}
            onPress={() => handleToggleRead(item)}
          >
            <Text style={[styles.actionButtonText, item.read_at && styles.actionButtonTextRead]}>
              {item.read_at ? t('mobile.mark_unread') : t('mobile.mark_read')}
            </Text>
          </PressableWithFade>
        </View>
      </View>
    );
  };

  const visibleNotifications = showUnreadOnly
    ? notifications.filter((item) => !item.read_at)
    : notifications;

  return (
    <View style={[styles.safeArea, { paddingTop: contentTopInset(insets) }]}>
      <View style={styles.header}>
        <PressableWithFade
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
          testID="notifications-back"
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </PressableWithFade>
        <Text style={styles.headerTitle}>{t('mobile.notifications_title')}</Text>
        <View style={styles.backButton} />
      </View>
      <View style={styles.filterRow}>
        <PressableWithFade
          style={[styles.filterChip, showUnreadOnly && styles.filterChipActive]}
          onPress={() => setShowUnreadOnly((v) => !v)}
          static
        >
          <Text style={[styles.filterChipText, showUnreadOnly && styles.filterChipTextActive]}>
            {showUnreadOnly ? t('mobile.showing_unread_only') : t('mobile.show_unread_only')}
          </Text>
        </PressableWithFade>
      </View>
      {loading ? (
        <View style={styles.listContent}>
          <SkeletonList count={8} rowHeight={88} />
        </View>
      ) : (
        <FlashList
          data={visibleNotifications}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: scrollBottomPadding(insets, spacing.lg) }]}
          renderItem={renderNotification}
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Ionicons name="mail-outline" size={44} color="#9CA3AF" />
              <Text style={styles.stateText}>{t('mobile.no_notifications')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { padding: spacing.lg },
  filterRow: {
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  filterChip: {
    alignSelf: 'flex-start',
    minHeight: touch.minRowHeight,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  filterChipActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  filterChipTextActive: {
    color: '#1D4ED8',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 10,
  },
  cardUnread: {
    borderColor: '#93C5FD',
    backgroundColor: '#F8FBFF',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.lg,
  },
  cardContentPressable: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2563EB',
    marginTop: 4,
  },
  body: { marginTop: 6, fontSize: 14, color: '#374151', lineHeight: 20 },
  time: { marginTop: 8, fontSize: 12, color: '#6B7280' },
  actionButton: {
    alignSelf: 'center',
    marginLeft: 'auto',
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
    flexShrink: 0,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  actionButtonTextRead: {
    color: '#9CA3AF',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  stateText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
});
