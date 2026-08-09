import { View, Text, StyleSheet, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useAuth } from '../../context/AuthContext';
import { filterByOrganizationId } from '../../utils/orgScope';
import { 
  fetchUserIncompleteTasks, 
  fetchTodayEvents, 
  fetchActiveProjectsCount,
  fetchCompletedTasksCount,
  fetchOverdueTasksCount,
  fetchOverdueTasksList,
  fetchUserProjectsWithProgress,
  loadWithFallback,
} from '@siteweave/core-logic';
import KPICarousel from '../../components/KPICarousel';
import OverdueTasksModal from '../../components/OverdueTasksModal';
import MyDayItemModal from '../../components/MyDayItemModal';
import PhotoAttachSheet from '../../components/PhotoAttachSheet';
import { resolveTaskOrganizationId } from '../../utils/pickAndUploadTaskPhoto';
import { alertPhotoUploadFailed } from '../../utils/photoUploadFeedback';
import { useTaskPhotoAttach } from '../../hooks/useTaskPhotoAttach';
import { useBranding } from '../../context/BrandingContext';
import ProfileDrawer from '../../components/ProfileDrawer';
import PressableWithFade from '../../components/PressableWithFade';
import GettingStartedChecklist from '../../components/GettingStartedChecklist';
import PanelEmptyState from '../../components/PanelEmptyState';
import WeatherCard from '../../components/ui/WeatherCard';
import { useCreateAction } from '../../context/CreateActionContext';
import { useMobileExperience } from '../../context/MobileExperienceContext';
import WeatherShiftSheet from '../../components/WeatherShiftSheet';
import SiteDaySheet from '../../components/SiteDaySheet';
import SyncStatusBanner from '../../components/SyncStatusBanner';
import { useSyncStatus } from '../../context/SyncStatusContext';
import { Text as UiText } from '../../components/ui/Text';
import { colors, spacing, touch } from '../../theme';
import { scrollBottomPadding, contentTopInset } from '../../utils/layoutInsets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NotificationBadge from '../../components/ui/NotificationBadge';
import { useNotificationCount } from '../../context/NotificationCountContext';
import { Ionicons } from '@expo/vector-icons';
import { useHaptics } from '../../hooks/useHaptics';
import { getCached, setCached } from '../../utils/persistentCache';
import { buildMyDayItems, daysFromDueToToday } from '../../utils/myDay';
import { countDueTodayTasks } from '../../utils/widgetSnapshot';
import { publishHomeWidgetSnapshot } from '../../utils/publishWidgetSnapshot';
import { getSiteDayStreak } from '../../utils/siteDayStreak';
import i18n from '../../i18n';
import { SkeletonList } from '../../components/ui/Skeleton';
import Avatar from '../../components/ui/Avatar';
import { warmProjectsListCache, warmProjectDetailCache } from '../../utils/prefetchIntent';
import { useScrollPrefetch } from '../../hooks/useScrollPrefetch';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user, supabase, activeOrganization, isProjectCollaborator, collaborationProjects, profileAvatarUrl, canCreateProjects } = useAuth();
  const { isManagerView, mode } = useMobileExperience();
  const { primaryColor } = useBranding();
  const router = useRouter();
  const { action } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const scrollRef = useRef(null);
  const weatherCardY = useRef(0);
  const myDayPhotoAfterDismissRef = useRef(null);
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [kpis, setKpis] = useState({ activeProjects: null, completedTasks: null, overdueTasks: null });
  const [myDayItems, setMyDayItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const { unreadCount: unreadNotificationCount, refreshUnreadCount } = useNotificationCount();
  const { isOnline, queueSize, flushQueue } = useSyncStatus();
  const [showWeatherShift, setShowWeatherShift] = useState(false);
  const [showOverdueModal, setShowOverdueModal] = useState(false);
  const [overdueModalTasks, setOverdueModalTasks] = useState([]);
  const [overdueModalLoading, setOverdueModalLoading] = useState(false);
  const [checklistRefreshKey, setChecklistRefreshKey] = useState(0);
  const [showSiteDay, setShowSiteDay] = useState(false);
  const [siteDayStreak, setSiteDayStreak] = useState(0);
  const { openCreateProject, openSiteDay, openReportIssue } = useCreateAction();
  const {
    photoUploadTaskId,
    photoStatusByTaskId,
    openPhotoSheet,
    retryUpload,
    photoSheetProps,
  } = useTaskPhotoAttach({
    supabase,
    userId: user?.id,
    resolveOrganizationId: (task) =>
      resolveTaskOrganizationId(task, activeOrganization, projects),
    onSuccess: async () => {
      haptics.success();
    },
    onError: (error, { retry, retake } = {}) => {
      haptics.error();
      alertPhotoUploadFailed({
        t,
        message:
          error?.message ||
          t('mobile.task_photo_upload_failed', { defaultValue: 'Could not upload photo.' }),
        onRetry: retry,
        onRetake: retake,
      });
    },
  });

  useEffect(() => {
    if (action === 'site-day') {
      openSiteDay();
      router.setParams({ action: undefined });
    }
  }, [action, openSiteDay, router]);

  useEffect(() => {
    if (!user?.id) {
      setSiteDayStreak(0);
      return;
    }
    getSiteDayStreak(user.id).then(setSiteDayStreak).catch(() => setSiteDayStreak(0));
  }, [user?.id, showSiteDay]);

  const loadData = async ({ silent = false } = {}) => {
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
    if (!refreshing && !silent) {
      const cached = await getCached(user.id, cacheResource);
      if (cached) {
        if (cached.projects?.length) setProjects(cached.projects);
        if (cached.tasks?.length) setTasks(cached.tasks);
        if (cached.kpis) setKpis(cached.kpis);
        setLoading(false);
      }
    }
    
    try {
      if (!refreshing && !silent) setLoading(true);

      const [
        tasksData,
        eventsData,
        projectsData,
        activeCount,
        completedCount,
        overdueCount,
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
      ]);
      
      refreshUnreadCount();
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

      setMyDayItems(
        buildMyDayItems({
          tasks: orgTasks,
          events: orgEvents,
          limit: 3,
          maxOverdueDays: 7,
        }),
      );
      await setCached(user.id, cacheResource, {
        projects: orgProjects,
        tasks: orgTasks,
        kpis: nextKpis,
      });

      await publishHomeWidgetSnapshot({
        tasks: orgTasks,
        events: orgEvents,
        projects: orgProjects,
        kpis: {
          ...nextKpis,
          dueToday: countDueTodayTasks(orgTasks),
          overdue: overdueCount ?? 0,
        },
        locale: i18n.language,
        experienceMode: mode,
        primaryColor,
        sync: { isOnline, pendingCount: queueSize },
        unreadNotifications: unreadNotificationCount,
      });
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user, activeOrganization, isProjectCollaborator, collaborationProjects, supabase]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData({ silent: true }), flushQueue({ silent: true })]);
    setRefreshing(false);
  };

  const handleItemPress = (item) => {
    haptics.light();
    setSelectedItem(item);
    setShowItemModal(true);
  };

  const handleItemComplete = (completedItem) => {
    if (completedItem?.id) {
      setMyDayItems((prev) => prev.filter((row) => !(row.type === 'task' && row.id === completedItem.id)));
      setTasks((prev) => prev.filter((row) => row.id !== completedItem.id));
    }
  };

  const handleItemCompleteFailed = () => {
    loadData({ silent: true });
  };

  const showWeatherCard = () => {
    haptics.light();
    scrollRef.current?.scrollToOffset?.({
      offset: Math.max(0, weatherCardY.current - spacing.lg),
      animated: true,
    });
  };

  const openWeatherLog = () => {
    haptics.light();
    showWeatherCard();
    setShowWeatherShift(true);
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
    openPhotoSheet(task);
  };

  const openOverdueModal = async () => {
    if (!supabase || (kpis.overdueTasks ?? 0) <= 0) return;
    haptics.light();
    setShowOverdueModal(true);
    setOverdueModalLoading(true);
    try {
      const projectIds = projects.map((p) => p.id).filter(Boolean);
      const rows = await fetchOverdueTasksList(supabase, { projectIds });
      setOverdueModalTasks(rows);
    } catch (error) {
      console.error('Error loading overdue tasks:', error);
      setOverdueModalTasks([]);
    } finally {
      setOverdueModalLoading(false);
    }
  };

  const handleOpenCreateProject = () => {
    openCreateProject({
      onCreated: () => {
        loadData({ silent: true });
        setChecklistRefreshKey((k) => k + 1);
      },
    });
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
    const photoStatus = photoStatusByTaskId[item.id];
    const photoBusy =
      photoUploadTaskId === item.id || photoStatus?.status === 'uploading';
    const photoFailed = photoStatus?.status === 'failed';
    const photoSaved = photoStatus?.status === 'saved';

    let dueLabel = null;
    let dueOverdue = false;
    if (isTask && item.due_date) {
      const offset = daysFromDueToToday(item.due_date);
      if (offset === 0) {
        dueLabel = t('mobile.my_day_due_today');
      } else if (offset != null && offset > 0) {
        dueOverdue = true;
        dueLabel = new Date(`${item.due_date}T12:00:00`).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        });
      } else {
        dueLabel = new Date(`${item.due_date}T12:00:00`).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        });
      }
    }

    const eventTimeLabel = isEvent && item.start_time
      ? new Date(item.start_time).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      : null;

    return (
      <PressableWithFade
        style={styles.myDayItem}
        onPress={() => handleItemPress(item)}
        static
        hapticType="light"
      >
        <View style={styles.myDayItemContent}>
          {isTask ? (
            <Ionicons name="checkbox-outline" size={20} color="#3B82F6" style={styles.myDayIcon} />
          ) : null}
          {isEvent ? (
            <Ionicons name="calendar-outline" size={20} color="#10B981" style={styles.myDayIcon} />
          ) : null}
          <Text style={styles.myDayItemTitle} numberOfLines={1}>
            {item.text || item.title}
          </Text>
          {dueLabel ? (
            <Text
              style={[styles.myDayDueChip, dueOverdue && styles.myDayOverdue]}
              numberOfLines={1}
            >
              {dueOverdue ? t('mobile.my_day_overdue', { date: dueLabel }) : dueLabel}
            </Text>
          ) : null}
          {eventTimeLabel ? (
            <Text style={styles.myDayDueChip} numberOfLines={1}>
              {eventTimeLabel}
            </Text>
          ) : null}
          <View style={styles.myDayItemActions}>
            {canAddPhoto ? (
              <PressableWithFade
                onPress={() => {
                  if (photoFailed) {
                    retryUpload(item);
                    return;
                  }
                  openTaskPhotoSheet(item);
                }}
                style={styles.myDayPhotoBtn}
                hitSlop={touch.hitSlop}
                disabled={photoBusy && !photoFailed}
                testID={`my-day-photo-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={
                  photoFailed
                    ? t('mobile.photo_retry', { defaultValue: 'Retry' })
                    : t('mobile.add_photo')
                }
                hapticType="light"
              >
                {photoBusy && !photoFailed ? (
                  <ActivityIndicator size="small" color={primaryColor} />
                ) : (
                  <Ionicons
                    name={
                      photoFailed
                        ? 'refresh'
                        : photoSaved
                          ? 'checkmark-circle'
                          : 'camera-outline'
                    }
                    size={20}
                    color={
                      photoFailed
                        ? '#EF4444'
                        : photoSaved
                          ? '#10B981'
                          : primaryColor
                    }
                  />
                )}
              </PressableWithFade>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color="#4B5563" />
          </View>
        </View>
      </PressableWithFade>
    );
  };

  useFocusEffect(
    useCallback(() => {
      if (!user?.id || !supabase) return undefined;
      warmProjectsListCache({
        supabase,
        userId: user.id,
        organizationId: activeOrganization?.id,
      }).catch(() => {});
      return undefined;
    }, [user?.id, supabase, activeOrganization?.id]),
  );

  const onHomeScrollPrefetch = useScrollPrefetch(() => {
    projects.slice(0, 5).forEach((p) => {
      if (user?.id && supabase && p?.id) {
        warmProjectDetailCache({
          supabase,
          userId: user.id,
          projectId: p.id,
        }).catch(() => {});
      }
    });
  });

  const listHeader = useMemo(
    () => (
      <>
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
                style={styles.inboxButton}
                onPress={() => {
                  haptics.light();
                  router.push('/(tabs)/notifications');
                }}
                hapticType="light"
                testID="home-inbox-button"
                accessibilityRole="button"
                accessibilityLabel={t('mobile.tab_inbox')}
              >
                <Ionicons name="mail-outline" size={24} color="#111827" />
                <NotificationBadge count={unreadNotificationCount} testID="home-inbox-badge" />
              </PressableWithFade>
              <PressableWithFade
                style={styles.profileButton}
                onPress={() => {
                  haptics.light();
                  setShowProfileDrawer(true);
                }}
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

        <GettingStartedChecklist
          firstProjectId={projects[0]?.id}
          projectCount={projects.length}
          taskCount={tasks.length}
          canCreateProjects={canCreateProjects && isManagerView}
          isManagerView={isManagerView}
          onCreateProject={handleOpenCreateProject}
          onInviteCrew={() => {
            if (projects[0]?.id) {
              router.push(`/(tabs)/projects/${projects[0].id}?openInvite=1`);
            } else if (canCreateProjects) {
              handleOpenCreateProject();
            }
          }}
          onAddTask={() => {
            if (projects[0]?.id) {
              router.push(`/(tabs)/projects/${projects[0].id}`);
            } else if (canCreateProjects) {
              handleOpenCreateProject();
            } else {
              router.push('/(tabs)/projects');
            }
          }}
          refreshKey={checklistRefreshKey}
        />

        <SyncStatusBanner />

        <View
          onLayout={(event) => {
            weatherCardY.current = event.nativeEvent.layout.y;
          }}
        >
          <WeatherCard onLogWeather={projects.length > 0 ? openWeatherLog : undefined} />
        </View>

        {isManagerView ? (
          <View style={styles.kpiSection}>
            <KPICarousel
              activeProjects={kpis.activeProjects}
              completedTasks={kpis.completedTasks}
              overdueTasks={kpis.overdueTasks}
              onOverduePress={openOverdueModal}
            />
          </View>
        ) : null}

        {(loading || projects.length > 0 || myDayItems.length > 0) && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t('mobile.my_day_section')}</Text>
            </View>
            {projects.length > 0 ? (
              <View style={styles.captureRow} testID="home-capture-actions">
                <PressableWithFade
                  style={styles.captureChip}
                  onPress={() => {
                    haptics.light();
                    setShowSiteDay(true);
                  }}
                  testID="home-site-day"
                  accessibilityRole="button"
                  accessibilityLabel={t('mobile.site_day_title')}
                >
                  <Ionicons name="camera-outline" size={18} color={colors.primary} />
                  <Text style={styles.captureChipText}>{t('mobile.site_day_title')}</Text>
                </PressableWithFade>
                <PressableWithFade
                  style={styles.captureChip}
                  onPress={() => {
                    haptics.light();
                    openReportIssue();
                  }}
                  testID="home-report-issue"
                  accessibilityRole="button"
                  accessibilityLabel={t('mobile.report_issue')}
                >
                  <Ionicons name="alert-circle-outline" size={18} color={colors.primary} />
                  <Text style={styles.captureChipText}>{t('mobile.report_issue')}</Text>
                </PressableWithFade>
              </View>
            ) : null}
            {siteDayStreak > 1 ? (
              <Text style={styles.streakText} testID="home-site-day-streak">
                {t('mobile.site_day_streak', { count: siteDayStreak })}
              </Text>
            ) : null}
            {loading && myDayItems.length === 0 ? (
              <SkeletonList count={3} rowHeight={64} />
            ) : null}
            {!loading && myDayItems.length === 0 && projects.length > 0 ? (
              <Text style={styles.captureEmptyHint} testID="home-my-day-empty-hint">
                {t('mobile.capture_empty_hint', {
                  defaultValue: 'Log today’s work with a Site Day or report an issue.',
                })}
              </Text>
            ) : null}
          </View>
        )}
      </>
    ),
    [
      activeOrganization?.name,
      isProjectCollaborator,
      t,
      unreadNotificationCount,
      profileAvatarUrl,
      projects,
      tasks.length,
      canCreateProjects,
      isManagerView,
      checklistRefreshKey,
      kpis,
      loading,
      myDayItems.length,
      siteDayStreak,
      haptics,
      router,
      openReportIssue,
    ],
  );

  const listFooter = useMemo(
    () => (
      <View style={styles.section}>
        <UiText variant="sectionTitle" style={styles.sectionTitle}>
          {t('mobile.recently_visited')}
        </UiText>
        {loading && projects.length === 0 ? (
          <SkeletonList count={2} rowHeight={72} />
        ) : projects.length > 0 ? (
          <View style={styles.recentsList}>
            {projects.slice(0, 5).map((p, i) => (
              <PressableWithFade
                key={p.id}
                style={[styles.recentRow, i < Math.min(projects.length, 5) - 1 && styles.recentRowBorder]}
                onPress={() => router.push(`/(tabs)/projects/${p.id}`)}
                onPressIn={() => {
                  if (user?.id && supabase && p?.id) {
                    warmProjectDetailCache({
                      supabase,
                      userId: user.id,
                      projectId: p.id,
                    }).catch(() => {});
                  }
                }}
                testID={`home-recent-${p.id}`}
                static
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
            ))}
          </View>
        ) : isManagerView && canCreateProjects ? (
          <PanelEmptyState
            icon="folder-open-outline"
            title={t('mobile.no_projects_assigned')}
            hint={t('mobile.projects_empty_hint')}
            ctaLabel={t('mobile.create_project_title')}
            onCta={handleOpenCreateProject}
            testID="home-empty-create-project"
          />
        ) : (
          <Text style={styles.emptyText}>{t('mobile.no_projects_assigned')}</Text>
        )}
        <PressableWithFade
          style={styles.seeAll}
          onPress={() => router.push('/(tabs)/projects')}
          onPressIn={() => {
            if (user?.id && supabase) {
              warmProjectsListCache({
                supabase,
                userId: user.id,
                organizationId: activeOrganization?.id,
              }).catch(() => {});
            }
          }}
          testID="home-see-all-projects"
        >
          <Text style={styles.seeAllText}>{t('mobile.see_all_projects')}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </PressableWithFade>
      </View>
    ),
    [
      t,
      loading,
      projects,
      isManagerView,
      canCreateProjects,
      router,
      user?.id,
      supabase,
      activeOrganization?.id,
    ],
  );

  return (
    <View style={[styles.safeArea, { paddingTop: contentTopInset(insets) }]}>
      <FlashList
        ref={scrollRef}
        style={styles.container}
        data={myDayItems}
        keyExtractor={(item, index) => `${item.type}-${item.id || index}`}
        renderItem={({ item }) => renderMyDayItem({ item })}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding(insets, spacing.xxl) }}
        refreshControl={<RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        onScroll={onHomeScrollPrefetch}
        scrollEventThrottle={400}
      />

      <OverdueTasksModal
        visible={showOverdueModal}
        onClose={() => setShowOverdueModal(false)}
        tasks={overdueModalTasks}
        projects={projects}
        loading={overdueModalLoading}
      />
      <MyDayItemModal
        visible={showItemModal}
        item={selectedItem}
        onClose={() => {
          myDayPhotoAfterDismissRef.current = null;
          setShowItemModal(false);
          setSelectedItem(null);
        }}
        onDismissed={() => {
          const task = myDayPhotoAfterDismissRef.current;
          myDayPhotoAfterDismissRef.current = null;
          if (task) openTaskPhotoSheet(task);
        }}
        onComplete={handleItemComplete}
        onCompleteFailed={handleItemCompleteFailed}
        onAddPhoto={(task) => {
          myDayPhotoAfterDismissRef.current = task;
          setShowItemModal(false);
          setSelectedItem(null);
        }}
        photoUploading={!!photoUploadTaskId}
      />
      <PhotoAttachSheet {...photoSheetProps} />
      <ProfileDrawer
        visible={showProfileDrawer}
        onClose={() => setShowProfileDrawer(false)}
      />
      <WeatherShiftSheet
        visible={showWeatherShift}
        onClose={() => setShowWeatherShift(false)}
        supabase={supabase}
        organizationId={activeOrganization?.id || projects[0]?.organization_id}
        userId={user?.id}
        projects={projects}
        onSaved={() => {
          setChecklistRefreshKey((value) => value + 1);
          loadData({ silent: true });
        }}
      />
      <SiteDaySheet
        visible={showSiteDay}
        onClose={() => setShowSiteDay(false)}
        supabase={supabase}
        userId={user?.id}
        organizationId={activeOrganization?.id || projects[0]?.organization_id}
        projects={projects}
        tasks={tasks}
        onPosted={() => loadData({ silent: true })}
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
  recentsList: {
    marginTop: spacing.sm,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
    minHeight: touch.minRowHeight,
  },
  recentRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  recentIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentText: { flex: 1 },
  recentTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  recentSub: { fontSize: 14, color: colors.textMuted, marginTop: 2, fontVariant: 'tabular-nums' },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    minHeight: touch.minSize,
    marginTop: spacing.sm,
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
  inboxButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: spacing.sm,
  },
  siteDayBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    minHeight: touch.minSize - 12,
    justifyContent: 'center',
  },
  siteDayBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  captureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  captureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    minHeight: touch.minSize - 8,
  },
  captureChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  captureEmptyHint: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  streakText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondary,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 0,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  myDayItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    minHeight: touch.minRowHeight,
  },
  myDayItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  myDayIcon: {
    flexShrink: 0,
  },
  myDayItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  myDayPhotoBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myDayItemTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  myDayDueChip: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    maxWidth: 96,
    flexShrink: 0,
  },
  myDayOverdue: {
    color: '#DC2626',
  },
  emptyText: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    paddingVertical: 20,
  },
});











