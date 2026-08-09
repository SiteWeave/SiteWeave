import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { fetchUserIncompleteTasks, fetchUserProjectsWithProgress } from '@siteweave/core-logic';
import { useAuth } from './AuthContext';
import { useMobileExperience } from './MobileExperienceContext';
import { filterByOrganizationId } from '../utils/orgScope';
import IssueProjectPickerSheet from '../components/IssueProjectPickerSheet';
import FieldIssueSheet from '../components/FieldIssueSheet';
import SiteDaySheet from '../components/SiteDaySheet';
import CreateProjectSheet from '../components/CreateProjectSheet';
import EventSheet from '../components/EventSheet';
import BottomSheet from '../components/ui/BottomSheet';
import PressableWithFade from '../components/PressableWithFade';
import { Text } from '../components/ui/Text';
import { colors, spacing, touch } from '../theme';
import { useHaptics } from '../hooks/useHaptics';

const CreateActionContext = createContext({
  openCreateMenu: () => {},
  openCreateProject: () => {},
  openCreateEvent: () => {},
  openSiteDay: () => {},
  openReportIssue: () => {},
  showCreateButton: false,
});

export function CreateActionProvider({ children }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const haptics = useHaptics();
  const { user, supabase, activeOrganization, canCreateProjects } = useAuth();
  const { isManagerView } = useMobileExperience();

  const [menuVisible, setMenuVisible] = useState(false);
  const [issuePickerVisible, setIssuePickerVisible] = useState(false);
  const [issueSheetVisible, setIssueSheetVisible] = useState(false);
  const [issueProject, setIssueProject] = useState(null);
  const [siteDayVisible, setSiteDayVisible] = useState(false);
  const [createProjectVisible, setCreateProjectVisible] = useState(false);
  const [createEventVisible, setCreateEventVisible] = useState(false);
  const [createEventDate, setCreateEventDate] = useState(() => new Date());
  const [siteDayProjects, setSiteDayProjects] = useState([]);
  const [siteDayTasks, setSiteDayTasks] = useState([]);

  const afterMenuDismissRef = useRef(null);
  const afterPickerDismissRef = useRef(null);
  const createProjectHooksRef = useRef(null);

  const showCreateButton = Boolean(user);

  const loadSiteDayData = useCallback(async () => {
    if (!user || !supabase) return;
    const [projectsData, tasksData] = await Promise.all([
      fetchUserProjectsWithProgress(supabase, user.id),
      fetchUserIncompleteTasks(supabase, user.id),
    ]);
    const scopedProjects = activeOrganization?.id
      ? filterByOrganizationId(projectsData || [], activeOrganization.id)
      : projectsData || [];
    setSiteDayProjects(scopedProjects);
    setSiteDayTasks(tasksData || []);
  }, [user, supabase, activeOrganization?.id]);

  const openCreateMenu = useCallback(() => {
    if (!showCreateButton) return;
    haptics.medium();
    setMenuVisible(true);
  }, [showCreateButton, haptics]);

  const closeMenu = useCallback(() => setMenuVisible(false), []);

  const scheduleAfterMenu = useCallback((fn) => {
    afterMenuDismissRef.current = fn;
    closeMenu();
  }, [closeMenu]);

  const handleMenuDismissed = useCallback(() => {
    const next = afterMenuDismissRef.current;
    afterMenuDismissRef.current = null;
    next?.();
  }, []);

  const openCreateProject = useCallback(
    (options = {}) => {
      if (!isManagerView || !canCreateProjects) return;
      haptics.medium();
      createProjectHooksRef.current = options;
      const openSheet = () => setCreateProjectVisible(true);
      if (menuVisible) {
        scheduleAfterMenu(openSheet);
      } else {
        openSheet();
      }
    },
    [isManagerView, canCreateProjects, haptics, menuVisible, scheduleAfterMenu],
  );

  const openCreateEvent = useCallback(
    (date = new Date(), { fromMenu = false } = {}) => {
      if (!isManagerView) return;
      haptics.medium();
      setCreateEventDate(date instanceof Date ? date : new Date(date));
      const openSheet = () => setCreateEventVisible(true);
      if (fromMenu) {
        scheduleAfterMenu(openSheet);
      } else {
        openSheet();
      }
    },
    [isManagerView, haptics, scheduleAfterMenu],
  );

  const openReportIssue = useCallback(
    ({ fromMenu = false } = {}) => {
      haptics.medium();
      const openSheet = () => setIssuePickerVisible(true);
      if (fromMenu) {
        scheduleAfterMenu(openSheet);
      } else {
        openSheet();
      }
    },
    [haptics, scheduleAfterMenu],
  );

  const handleIssueProjectSelected = useCallback((project) => {
    setIssueProject(project);
    afterPickerDismissRef.current = () => setIssueSheetVisible(true);
    setIssuePickerVisible(false);
  }, []);

  const handlePickerDismissed = useCallback(() => {
    const next = afterPickerDismissRef.current;
    afterPickerDismissRef.current = null;
    next?.();
  }, []);

  const openSiteDay = useCallback(async () => {
    await loadSiteDayData();
    setSiteDayVisible(true);
  }, [loadSiteDayData]);

  const menuItems = useMemo(() => {
    const items = [];
    // Field capture first — site day + report issue are the daily path.
    items.push({
      key: 'site-day',
      label: t('mobile.site_day_title'),
      icon: 'camera-outline',
      onPress: () => {
        scheduleAfterMenu(async () => {
          await openSiteDay();
        });
      },
    });
    items.push({
      key: 'issue',
      label: t('mobile.report_issue'),
      icon: 'alert-circle-outline',
      onPress: () => openReportIssue({ fromMenu: true }),
    });
    if (isManagerView && canCreateProjects) {
      items.push({
        key: 'project',
        label: t('mobile.create_project_title'),
        icon: 'folder-open-outline',
        onPress: () => scheduleAfterMenu(() => setCreateProjectVisible(true)),
      });
    }
    if (isManagerView) {
      items.push({
        key: 'event',
        label: t('mobile.create_event_title'),
        icon: 'calendar-outline',
        onPress: () => openCreateEvent(new Date(), { fromMenu: true }),
      });
    }
    return items;
  }, [
    t,
    i18n.language,
    isManagerView,
    canCreateProjects,
    scheduleAfterMenu,
    openSiteDay,
    openCreateEvent,
    openReportIssue,
  ]);

  const value = useMemo(
    () => ({
      openCreateMenu,
      openCreateProject,
      openCreateEvent,
      openSiteDay,
      openReportIssue,
      showCreateButton,
    }),
    [openCreateMenu, openCreateProject, openCreateEvent, openSiteDay, openReportIssue, showCreateButton],
  );

  return (
    <CreateActionContext.Provider value={value}>
      {children}

      <BottomSheet
        visible={menuVisible}
        title={t('mobile.create_menu_title')}
        onClose={closeMenu}
        dismissWithoutAnimation
        onDismissed={handleMenuDismissed}
        testID="create-menu"
      >
        <View style={styles.menuList}>
          {menuItems.map((item) => (
            <PressableWithFade
              key={item.key}
              style={styles.menuRow}
              onPress={item.onPress}
              testID={`create-action-${item.key}`}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <View style={styles.menuIconWrap}>
                <Ionicons name={item.icon} size={22} color={colors.primary} />
              </View>
              <Text variant="body" style={styles.menuLabel}>
                {item.label}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
            </PressableWithFade>
          ))}
        </View>
      </BottomSheet>

      <IssueProjectPickerSheet
        visible={issuePickerVisible}
        onClose={() => setIssuePickerVisible(false)}
        onDismissed={handlePickerDismissed}
        supabase={supabase}
        userId={user?.id}
        activeOrganization={activeOrganization}
        onSelectProject={handleIssueProjectSelected}
      />

      <FieldIssueSheet
        visible={issueSheetVisible}
        onClose={() => {
          setIssueSheetVisible(false);
          setIssueProject(null);
        }}
        supabase={supabase}
        projectId={issueProject?.id}
        organizationId={issueProject?.organization_id}
        userId={user?.id}
        onCreated={() => {
          setIssueSheetVisible(false);
          setIssueProject(null);
        }}
      />

      <SiteDaySheet
        visible={siteDayVisible}
        onClose={() => setSiteDayVisible(false)}
        supabase={supabase}
        userId={user?.id}
        organizationId={activeOrganization?.id || siteDayProjects[0]?.organization_id}
        projects={siteDayProjects}
        tasks={siteDayTasks}
        onPosted={() => setSiteDayVisible(false)}
      />

      <CreateProjectSheet
        visible={createProjectVisible}
        supabase={supabase}
        userId={user?.id}
        activeOrganization={activeOrganization}
        onClose={() => {
          setCreateProjectVisible(false);
          createProjectHooksRef.current = null;
        }}
        onCreated={(created) => {
          setCreateProjectVisible(false);
          createProjectHooksRef.current?.onCreated?.(created);
          createProjectHooksRef.current = null;
          if (created?.id) {
            router.push(`/(tabs)/projects/${created.id}`);
          }
        }}
      />

      <EventSheet
        visible={createEventVisible}
        onClose={() => setCreateEventVisible(false)}
        selectedDate={createEventDate}
        onEventCreated={() => {
          setCreateEventVisible(false);
          router.push('/(tabs)/calendar');
        }}
      />
    </CreateActionContext.Provider>
  );
}

export function useCreateAction() {
  return useContext(CreateActionContext);
}

const styles = StyleSheet.create({
  menuList: { gap: spacing.xs },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.minRowHeight,
    paddingVertical: spacing.sm,
  },
  menuIconWrap: {
    width: touch.minSize,
    height: touch.minSize,
    borderRadius: touch.minSize / 2,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1 },
});
