import { View, Text, StyleSheet, ScrollView, RefreshControl, FlatList, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { filterByOrganizationId } from '../../utils/orgScope';
import { fetchUnreadNotificationCount } from '../../utils/notifications';
import { 
  fetchUserIncompleteTasks, 
  fetchTodayEvents, 
  fetchActiveProjectsCount,
  fetchCompletedTasksCount,
  fetchOverdueTasksCount,
  fetchUserProjectsWithProgress,
  loadWithFallback,
} from '@siteweave/core-logic';
import QuickActionsModal from '../../components/QuickActionsModal';
import KPICarousel from '../../components/KPICarousel';
import MyDayItemModal from '../../components/MyDayItemModal';
import PhotoAttachSheet from '../../components/PhotoAttachSheet';
import { pickAndUploadTaskPhoto, resolveTaskOrganizationId } from '../../utils/pickAndUploadTaskPhoto';
import { useBranding } from '../../context/BrandingContext';
import ProjectCardCompact from '../../components/ProjectCardCompact';
import ProfileDrawer from '../../components/ProfileDrawer';
import PressableWithFade from '../../components/PressableWithFade';
import WeatherCard from '../../components/ui/WeatherCard';
import WeatherShiftSheet from '../../components/WeatherShiftSheet';
import Card from '../../components/ui/Card';
import { Text as UiText } from '../../components/ui/Text';
import { colors, spacing, touch } from '../../theme';
import { TAB_BAR_CLEARANCE, scrollBottomPadding } from '../../components/ui/FloatingTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHaptics } from '../../hooks/useHaptics';
import { getCached, setCached } from '../../utils/persistentCache';
import { SkeletonCard, SkeletonList } from '../../components/ui/Skeleton';
import Avatar from '../../components/ui/Avatar';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user, supabase, activeOrganization, isProjectCollaborator, collaborationProjects, profileAvatarUrl } = useAuth();
  const { primaryColor } = useBranding();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [kpis, setKpis] = useState({ activeProjects: null, completedTasks: null, overdueTasks: null });
  const [myDayItems, setMyDayItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [showWeatherShift, setShowWeatherShift] = useState(false);
  const [photoTask, setPhotoTask] = useState(null);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [photoUploadTaskId, setPhotoUploadTaskId] = useState(null);

  useEffect(() => {
    if (!supabase || !user) return;
    const channel = supabase
      .channel('user_notifications_home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_notifications' }, async () => {
        try {
          const unreadCount = await fetchUnreadNotificationCount(supabase, { userId: user.id, email: user.email || '' });
          setUnreadNotificationCount(unreadCount || 0);
        } catch (error) {
          console.error('Failed to refresh unread notification count:', error);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user]);

  const loadData = async () => {
    if (!user || !supabase || (!activeOrganization && !isProjectCollaborator)) {
      setTasks([]);
      setEvents([]);
      setProjects([]);
      setKpis({ activeProjects: null, completedTasks: null, overdueTasks: null });
      setMyDayItems([]);
      setLoading(false);
      return;
    }

    const cacheResource = `home:${activeOrganization?.id || 'guest'}`;
    if (!refreshing) {
      const cached = await getCached(user.id, cacheResource);
      if (cached) {
        if (cached.projects?.length) setProjects(cached.projects);
        if (cached.tasks?.length) setTasks(cached.tasks);
        if (cached.kpis) setKpis(cached.kpis);
        setLoading(false);
      }
    }
    
    try {
      if (!refreshing) setLoading(true);

      const [
        tasksData,
        eventsData,
        projectsData,
        activeCount,
        completedCount,
        overdueCount,
        unreadCount,
      ] = await Promise.all([
        loadWithFallback(
          () => fetchUserIncompleteTasks(supabase, user.id, undefined, { limit: 20, orderByDueDate: true }),
          [],
          { label: 'home_tasks' },
        ),
        loadWithFallback(
          () => fetchTodayEvents(supabase),
          [],
          { label: 'home_events' },
        ),
        loadWithFallback(
          () => fetchUserProjectsWithProgress(supabase, user.id, { limit: 50 }),
          [],
          { label: 'home_projects' },
        ),
        loadWithFallback(
          () => fetchActiveProjectsCount(supabase, user.id),
          null,
          { label: 'home_active_projects_count' },
        ),
        loadWithFallback(
          () => fetchCompletedTasksCount(supabase, user.id),
          null,
          { label: 'home_completed_tasks_count' },
        ),
        loadWithFallback(
          () => fetchOverdueTasksCount(supabase, user.id),
          null,
          { label: 'home_overdue_tasks_count' },
        ),
        loadWithFallback(
          () => fetchUnreadNotificationCount(supabase, { userId: user.id, email: user.email || '' }),
          0,
          { label: 'home_unread_notifications' },
        ),
      ]);
      
      const orgId = activeOrganization?.id;
      const orgTasks = orgId ? filterByOrganizationId(tasksData || [], orgId) : (tasksData || []);
      const orgEvents = orgId ? filterByOrganizationId(eventsData || [], orgId) : (eventsData || []);
      let orgProjects = orgId ? filterByOrganizationId(projectsData || [], orgId) : (projectsData || []);

      if (!orgId && isProjectCollaborator && collaborationProjects?.length) {
        const byId = new Map(orgProjects.map((p) => [p.id, p]));
        for (const p of collaborationProjects) {
          if (!byId.has(p.id)) {
            byId.set(p.id, { ...p, progress: p.progress ?? 0 });
          }
        }
        orgProjects = Array.from(byId.values());
      }
      
      setTasks(orgTasks);
      setEvents(orgEvents);
      setProjects(orgProjects);
      const nextKpis = {
        activeProjects: activeCount,
        completedTasks: completedCount,
        overdueTasks: overdueCount,
      };
      setKpis(nextKpis);
      setUnreadNotificationCount(unreadCount || 0);

      // Combine and prioritize My Day items (top 3)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Prioritize tasks: due today first, then by priority
      const prioritizedTasks = orgTasks
        .map(task => ({
          ...task,
          type: 'task',
          priorityScore: getTaskPriorityScore(task, today),
        }))
        .sort((a, b) => b.priorityScore - a.priorityScore);

      // Prioritize events: by start time
      const prioritizedEvents = orgEvents
        .map(event => ({
          ...event,
          type: 'event',
          priorityScore: new Date(event.start_time).getTime(),
        }))
        .sort((a, b) => a.priorityScore - b.priorityScore);

      // Combine and take top 3
      const combined = [...prioritizedTasks, ...prioritizedEvents]
        .sort((a, b) => {
          // Events happening soon get higher priority
          if (a.type === 'event' && b.type === 'task') {
            const eventTime = new Date(a.start_time || a.priorityScore);
            const now = new Date();
            // If event is within next 2 hours, prioritize it
            if (eventTime.getTime() - now.getTime() < 2 * 60 * 60 * 1000) {
              return -1;
            }
          }
          return a.priorityScore - b.priorityScore;
        })
        .slice(0, 3);

      setMyDayItems(combined);
      await setCached(user.id, cacheResource, {
        projects: orgProjects,
        tasks: orgTasks,
        kpis: nextKpis,
      });
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTaskPriorityScore = (task, today) => {
    let score = 0;
    
    // Due today gets high priority
    if (task.due_date) {
      const dueDate = new Date(task.due_date);
      dueDate.setHours(0, 0, 0, 0);
      if (dueDate.getTime() === today.getTime()) {
        score += 1000;
      } else if (dueDate.getTime() < today.getTime()) {
        score += 2000; // Overdue gets highest
      }
    }

    // Priority adds to score
    switch (task.priority?.toLowerCase()) {
      case 'high':
        score += 100;
        break;
      case 'medium':
        score += 50;
        break;
      case 'low':
        score += 10;
        break;
    }

    return score;
  };

  useEffect(() => {
    loadData();
  }, [user, activeOrganization, isProjectCollaborator, collaborationProjects, supabase]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleItemPress = (item) => {
    haptics.light();
    setSelectedItem(item);
    setShowItemModal(true);
  };

  const handleItemComplete = () => {
    loadData(); // Refresh data after completion
  };

  const openTaskPhotoSheet = (task) => {
    if (!task?.project_id) {
      Alert.alert(t('common.error'), t('mobile.task_photo_missing_project', { defaultValue: 'This task is not linked to a project.' }));
      return;
    }
    const orgId = resolveTaskOrganizationId(task, activeOrganization, projects);
    if (!orgId) {
      Alert.alert(t('common.error'), t('mobile.task_photo_missing_org', { defaultValue: 'Could not resolve organization for this task.' }));
      return;
    }
    haptics.light();
    setPhotoTask(task);
    setShowPhotoSheet(true);
  };

  const runTaskPhotoUpload = async (mode) => {
    const task = photoTask;
    if (!task) return;
    const orgId = resolveTaskOrganizationId(task, activeOrganization, projects);
    if (!orgId) return;

    try {
      setPhotoUploadTaskId(task.id);
      const uploaded = await pickAndUploadTaskPhoto({
        supabase,
        task,
        organizationId: orgId,
        userId: user?.id,
        mode,
      });
      if (uploaded) {
        haptics.success();
        Alert.alert(t('common.success'), t('mobile.task_photo_attached', { defaultValue: 'Photo attached to task.' }));
      }
    } catch (error) {
      console.error('Error uploading task photo:', error);
      haptics.error();
      Alert.alert(t('common.error'), error.message || t('mobile.task_photo_upload_failed', { defaultValue: 'Could not upload photo.' }));
    } finally {
      setPhotoUploadTaskId(null);
      setShowPhotoSheet(false);
      setPhotoTask(null);
    }
  };

  const getUserName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name.split(' ')[0]; // First name only
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return 'there';
  };

  const renderMyDayItem = ({ item }) => {
    const isTask = item.type === 'task';
    const isEvent = item.type === 'event';
    const canAddPhoto = isTask && item.project_id && !item.completed;
    const photoBusy = photoUploadTaskId === item.id;

    return (
      <PressableWithFade
        style={styles.myDayItem}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
        hapticType="light"
      >
        <View style={styles.myDayItemContent}>
          <View style={styles.myDayItemLeft}>
            {isTask && (
              <Ionicons name="checkbox-outline" size={24} color="#3B82F6" />
            )}
            {isEvent && (
              <Ionicons name="calendar-outline" size={24} color="#10B981" />
            )}
            <View style={styles.myDayItemText}>
              <Text style={styles.myDayItemTitle} numberOfLines={1}>
                {item.text || item.title}
              </Text>
              {isTask && item.due_date && (
                <Text style={styles.myDayItemSubtitle}>
                  Due: {new Date(item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              )}
              {isEvent && item.start_time && (
                <Text style={styles.myDayItemSubtitle}>
                  {new Date(item.start_time).toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true 
                  })}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.myDayItemActions}>
            {canAddPhoto ? (
              <PressableWithFade
                onPress={() => openTaskPhotoSheet(item)}
                style={styles.myDayPhotoBtn}
                hitSlop={touch.hitSlop}
                disabled={photoBusy}
                testID={`my-day-photo-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.add_photo')}
                hapticType="light"
              >
                <Ionicons
                  name="camera-outline"
                  size={22}
                  color={photoBusy ? colors.textSubtle : primaryColor}
                />
              </PressableWithFade>
            ) : null}
            <Ionicons name="chevron-forward" size={20} color="#4B5563" />
          </View>
        </View>
      </PressableWithFade>
    );
  };

  const renderProject = ({ item }) => (
    <ProjectCardCompact project={item} />
  );

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding(insets, spacing.xxl) }}
        refreshControl={<RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View>
              {activeOrganization?.name ? (
                <Text style={styles.organizationName}>{activeOrganization.name}</Text>
              ) : isProjectCollaborator ? (
                <Text style={styles.organizationName}>{t('mobile.guest_projects_shared')}</Text>
              ) : null}
              <Text style={styles.greeting}>{t('mobile.hello', { name: getUserName() })}</Text>
            </View>
            <View style={styles.headerButtons}>
              <PressableWithFade 
                style={styles.notificationButton}
                onPress={() => {
                  haptics.light();
                  router.push('/(tabs)/notifications');
                }}
                activeOpacity={0.7}
                hapticType="light"
              >
                <Ionicons name="notifications-outline" size={24} color="#111827" />
                {unreadNotificationCount > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </Text>
                  </View>
                )}
              </PressableWithFade>
              <PressableWithFade 
                style={styles.profileButton}
                onPress={() => {
                  haptics.light();
                  setShowProfileDrawer(true);
                }}
                activeOpacity={0.7}
                hapticType="light"
              >
                <Avatar
                  name={getUserName()}
                  avatarUrl={profileAvatarUrl}
                  size="sm"
                />
              </PressableWithFade>
            </View>
          </View>
        </View>

        <WeatherCard onLogWeather={() => setShowWeatherShift(true)} />

        {/* Section A: KPIs Carousel */}
        <View style={styles.kpiSection}>
          <KPICarousel
            activeProjects={kpis.activeProjects}
            completedTasks={kpis.completedTasks}
            overdueTasks={kpis.overdueTasks}
          />
        </View>

        {/* Section B: My Day — hidden when loaded and nothing to show */}
        {(loading || myDayItems.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('mobile.my_day_section')}</Text>
            {loading && myDayItems.length === 0 ? (
              <SkeletonList count={3} rowHeight={64} />
            ) : (
              <View>
                {myDayItems.map((item, index) => (
                  <View key={`${item.type}-${item.id || index}`}>
                    {renderMyDayItem({ item })}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <UiText variant="sectionTitle" style={styles.sectionTitle}>
            {t('mobile.recently_visited')}
          </UiText>
          <Card style={styles.recentsCard}>
            {loading && projects.length === 0 ? (
              <View style={{ gap: spacing.md, padding: spacing.sm }}>
                <SkeletonCard height={72} />
                <SkeletonCard height={72} />
              </View>
            ) : projects.length > 0 ? (
              projects.slice(0, 5).map((p, i) => (
                <PressableWithFade
                  key={p.id}
                  style={[styles.recentRow, i < Math.min(projects.length, 5) - 1 && styles.recentRowBorder]}
                  onPress={() => router.push(`/(tabs)/projects/${p.id}`)}
                  testID={`home-recent-${p.id}`}
                >
                  <View style={styles.recentIcon}>
                    <Ionicons name="folder-outline" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.recentText}>
                    <Text style={styles.recentTitle} numberOfLines={1}>
                      {p.name || p.title}
                    </Text>
                    <Text style={styles.recentSub}>
                      {t('mobile.percent_complete', { percent: Math.round(p.progress_percent ?? p.progress ?? 0) })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
                </PressableWithFade>
              ))
            ) : (
              <Text style={styles.emptyText}>{t('mobile.no_projects_assigned')}</Text>
            )}
            <PressableWithFade
              style={styles.seeAll}
              onPress={() => router.push('/(tabs)/projects')}
              testID="home-see-all-projects"
            >
              <Text style={styles.seeAllText}>{t('mobile.see_all_projects')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </PressableWithFade>
          </Card>
        </View>
      </ScrollView>

      {/* FAB */}
      <PressableWithFade
        style={[styles.fab, { bottom: TAB_BAR_CLEARANCE + spacing.md }]}
        onPress={() => {
          haptics.medium();
          setShowQuickActions(true);
        }}
        activeOpacity={0.8}
        hapticType="medium"
      >
        <Text style={styles.fabText}>+</Text>
      </PressableWithFade>

      {/* Modals */}
      <QuickActionsModal
        visible={showQuickActions}
        onClose={() => setShowQuickActions(false)}
      />
      <MyDayItemModal
        visible={showItemModal}
        item={selectedItem}
        onClose={() => {
          setShowItemModal(false);
          setSelectedItem(null);
        }}
        onComplete={handleItemComplete}
        onAddPhoto={(task) => {
          setShowItemModal(false);
          setSelectedItem(null);
          openTaskPhotoSheet(task);
        }}
        photoUploading={!!photoUploadTaskId}
      />
      <PhotoAttachSheet
        visible={showPhotoSheet}
        onClose={() => {
          if (photoUploadTaskId) return;
          setShowPhotoSheet(false);
          setPhotoTask(null);
        }}
        uploading={!!photoUploadTaskId}
        onCamera={() => runTaskPhotoUpload('camera')}
        onLibrary={() => runTaskPhotoUpload('library')}
      />
      <ProfileDrawer
        visible={showProfileDrawer}
        onClose={() => setShowProfileDrawer(false)}
      />
      <WeatherShiftSheet
        visible={showWeatherShift}
        onClose={() => setShowWeatherShift(false)}
        supabase={supabase}
        organizationId={activeOrganization?.id}
        userId={user?.id}
        projects={projects}
        onSaved={loadData}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  recentsCard: { padding: 0, overflow: 'hidden', marginTop: spacing.sm },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    minHeight: 56,
  },
  recentRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  recentIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentText: { flex: 1 },
  recentTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  recentSub: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    minHeight: touch.minSize,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  seeAllText: { fontSize: 16, fontWeight: '600', color: colors.primary },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    minHeight: 44,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  organizationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  notificationButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  profileButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  profileAvatarImage: {
    width: 32,
    height: 32,
  },
  profileAvatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  kpiSection: {
    backgroundColor: colors.background,
    paddingTop: 0,
    paddingBottom: spacing.sm,
  },
  section: {
    padding: 20,
    backgroundColor: '#fff',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  myDayItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    minHeight: 44,
  },
  myDayItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  myDayItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  myDayItemText: {
    flex: 1,
  },
  myDayItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  myDayPhotoBtn: {
    minWidth: touch.minSize,
    minHeight: touch.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myDayItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  myDayItemSubtitle: {
    fontSize: 14,
    color: '#4B5563',
  },
  emptyText: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    paddingVertical: 20,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
});
