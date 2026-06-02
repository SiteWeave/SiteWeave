import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import { fetchUserProjectsWithProgress } from '@siteweave/core-logic';
import { filterByOrganizationId } from '../../../utils/orgScope';
import PressableWithFade from '../../../components/PressableWithFade';
import Card from '../../../components/ui/Card';
import ProgressBar from '../../../components/ui/ProgressBar';
import { Text as UiText } from '../../../components/ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, touch } from '../../../theme';
import { scrollBottomPadding } from '../../../components/ui/FloatingTabBar';
import { useBranding } from '../../../context/BrandingContext';
import { getCached, setCached } from '../../../utils/persistentCache';
import { SkeletonCard } from '../../../components/ui/Skeleton';

export default function ProjectsScreen() {
  const { t } = useTranslation();
  const { user, supabase, activeOrganization, isProjectCollaborator, collaborationProjects } = useAuth();
  const { primaryColor } = useBranding();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProjects = useCallback(async () => {
    if (!user || !supabase || (!activeOrganization && !isProjectCollaborator)) {
      setLoading(false);
      setProjects([]);
      return;
    }

    try {
      const cacheResource = `projects:${activeOrganization?.id || 'guest'}`;
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

      if (isProjectCollaborator && collaborationProjects?.length) {
        const byId = new Map(orgProjects.map((p) => [p.id, p]));
        for (const p of collaborationProjects) {
          if (!byId.has(p.id)) {
            byId.set(p.id, {
              ...p,
              progress: p.progress ?? 0,
              progress_percent: p.progress ?? 0,
            });
          }
        }
        orgProjects = Array.from(byId.values());
      }

      setProjects(orgProjects);
      await setCached(user.id, cacheResource, orgProjects);
    } catch (error) {
      console.error('Error loading projects:', error);
      setProjects([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, supabase, activeOrganization, isProjectCollaborator, collaborationProjects, refreshing]);

  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [loadProjects]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadProjects();
  };

  const renderProject = ({ item }) => {
    const pct = Math.round(item.progress_percent ?? item.progress ?? 0);
    return (
      <PressableWithFade
        onPress={() => router.push(`/(tabs)/projects/${item.id}`)}
        testID={`project-row-${item.id}`}
      >
        <Card style={styles.projectCard}>
          <View style={styles.projectRow}>
            <View style={[styles.iconBox, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="folder" size={24} color={primaryColor} />
            </View>
            <View style={styles.projectInfo}>
              <Text style={styles.projectName} numberOfLines={2}>
                {item.name || item.title}
              </Text>
              <Text style={styles.projectMeta}>{pct}% complete</Text>
              <ProgressBar percent={pct} height={6} />
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textSubtle} />
          </View>
        </Card>
      </PressableWithFade>
    );
  };

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <PressableWithFade onPress={() => router.back()} style={styles.backBtn} hitSlop={touch.hitSlop}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </PressableWithFade>
        <UiText variant="screenTitle">Projects</UiText>
        <View style={styles.backBtn} />
      </View>
      <FlatList
        data={projects}
        renderItem={renderProject}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: scrollBottomPadding(insets, spacing.lg) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletonList}>
              {[1, 2, 3, 4].map((i) => (
                <SkeletonCard key={i} height={88} style={styles.skeletonCard} />
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>No projects yet.</Text>
          )
        }
      />
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
    paddingBottom: spacing.md,
  },
  backBtn: { width: touch.minSize, height: touch.minSize, justifyContent: 'center' },
  list: { padding: spacing.lg, gap: spacing.md },
  projectCard: { marginBottom: spacing.md },
  projectRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectInfo: { flex: 1, gap: spacing.xs },
  projectName: { fontSize: 17, fontWeight: '700', color: colors.text },
  projectMeta: { fontSize: 14, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xxxl, fontSize: 16 },
  skeletonList: { gap: spacing.md, marginTop: spacing.md },
  skeletonCard: { marginBottom: spacing.sm },
});
