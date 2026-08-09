import { View, StyleSheet, RefreshControl, TextInput } from 'react-native';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useAuth } from '../../../context/AuthContext';
import { useMobileExperience } from '../../../context/MobileExperienceContext';
import { useCreateAction } from '../../../context/CreateActionContext';
import { fetchUserProjectsWithProgress } from '@siteweave/core-logic';
import { filterByOrganizationId } from '../../../utils/orgScope';
import AppHeader from '../../../components/ui/AppHeader';
import ProjectListCard from '../../../components/ProjectListCard';
import PanelEmptyState from '../../../components/PanelEmptyState';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../../theme';
import { scrollBottomPadding, contentTopInset } from '../../../utils/layoutInsets';
import { getCached, setCached } from '../../../utils/persistentCache';
import { warmProjectDetailCache } from '../../../utils/prefetchIntent';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { useSyncStatus } from '../../../context/SyncStatusContext';
import { useScrollPrefetch } from '../../../hooks/useScrollPrefetch';

export default function ProjectsScreen() {
  const { t } = useTranslation();
  const { user, supabase, activeOrganization, isProjectCollaborator, canCreateProjects } = useAuth();
  const { isManagerView } = useMobileExperience();
  const { openCreateProject } = useCreateAction();
  const { isOnline } = useSyncStatus();
  const previousOnlineRef = useRef(isOnline);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => (p.name || p.title || '').toLowerCase().includes(q));
  }, [projects, searchQuery]);

  const showCreate = isManagerView && canCreateProjects;

  const loadProjects = useCallback(async () => {
    if (!user || !supabase || (!activeOrganization && !isProjectCollaborator)) {
      setLoading(false);
      setProjects([]);
      return;
    }

    const cacheResource = `projects:${activeOrganization?.id || 'guest'}`;

    try {
      if (!refreshing) {
        setLoading(true);
        const cached = await getCached(user.id, cacheResource);
        if (cached?.length) {
          setProjects(cached);
          setLoading(false);
        }
      }
      const data = await fetchUserProjectsWithProgress(supabase, user.id, { limit: 50 });
      let orgProjects = activeOrganization
        ? filterByOrganizationId(data || [], activeOrganization.id)
        : data || [];

      setProjects(orgProjects);
      await setCached(user.id, cacheResource, orgProjects);
    } catch (error) {
      console.error('Error loading projects:', error);
      if (!isOnline) {
        const cached = await getCached(user.id, cacheResource);
        if (cached?.length) {
          setProjects(cached);
        } else {
          setProjects([]);
        }
      } else {
        setProjects([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, supabase, activeOrganization, isProjectCollaborator, refreshing, isOnline]);

  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [loadProjects]),
  );

  useEffect(() => {
    const cameOnline = isOnline && !previousOnlineRef.current;
    previousOnlineRef.current = isOnline;
    if (cameOnline) {
      loadProjects();
    }
  }, [isOnline, loadProjects]);

  useEffect(() => {
    if (!supabase || !user?.id) return undefined;

    const channel = supabase
      .channel(`project-lifecycle-mobile-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'project_lifecycle_events' },
        (payload) => {
          const event = payload.new;
          const projectId = event.project_id || event.metadata?.project_id;
          const cacheResource = `projects:${activeOrganization?.id || 'guest'}`;
          if (event.action === 'trashed' || event.action === 'purged') {
            setProjects((current) => {
              const next = current.filter((project) => project.id !== projectId);
              if (user?.id) {
                setCached(user.id, cacheResource, next).catch(() => {});
              }
              return next;
            });
          } else if (event.action === 'restored') {
            loadProjects();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user?.id, loadProjects, activeOrganization?.id]);

  const onRefresh = () => {
    setRefreshing(true);
    loadProjects();
  };

  const renderProject = ({ item }) => (
    <ProjectListCard
      project={item}
      onPress={() => router.push(`/(tabs)/projects/${item.id}`)}
      onPressIn={() => {
        if (user?.id && supabase && item?.id) {
          warmProjectDetailCache({
            supabase,
            userId: user.id,
            projectId: item.id,
          }).catch(() => {});
        }
      }}
      testID={`project-row-${item.id}`}
    />
  );

  const onScrollPrefetch = useScrollPrefetch(() => {
    // Projects list is not paginated; warm first visible details ahead of navigation.
    const ahead = filteredProjects.slice(0, 5);
    ahead.forEach((p) => {
      if (user?.id && supabase && p?.id) {
        warmProjectDetailCache({
          supabase,
          userId: user.id,
          projectId: p.id,
        }).catch(() => {});
      }
    });
  });

  return (
    <View style={[styles.safeArea, { paddingTop: contentTopInset(insets) }]}>
      <View style={styles.container}>
        <AppHeader title={t('mobile.projects_title')} testID="projects-header" />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('mobile.global_search_placeholder')}
          placeholderTextColor={colors.textSubtle}
          testID="projects-global-search"
        />
        <FlashList
          data={filteredProjects}
          renderItem={renderProject}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: scrollBottomPadding(insets, spacing.lg) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onScroll={onScrollPrefetch}
          scrollEventThrottle={400}
          ListEmptyComponent={
            loading ? (
              <View style={styles.skeletonList}>
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonCard key={i} height={132} style={styles.skeletonCard} />
                ))}
              </View>
            ) : (
              <PanelEmptyState
                icon="folder-open-outline"
                title={t('mobile.projects_empty')}
                hint={showCreate ? t('mobile.projects_empty_hint') : null}
                ctaLabel={showCreate ? t('mobile.create_project_title') : null}
                onCta={showCreate ? openCreateProject : null}
                hideCta={!showCreate}
                testID="projects-empty-create"
              />
            )
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  list: { paddingTop: spacing.xs },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  skeletonList: { gap: spacing.md, marginTop: spacing.md },
  skeletonCard: { marginBottom: spacing.sm },
});
