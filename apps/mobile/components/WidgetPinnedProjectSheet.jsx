import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fetchUserProjectsWithProgress, loadWithFallback } from '@siteweave/core-logic';
import BottomSheet from './ui/BottomSheet';
import PressableWithFade from './PressableWithFade';
import { Text } from './ui/Text';
import { colors, spacing } from '../theme';
import { useAuth } from '../context/AuthContext';
import { filterByOrganizationId } from '../utils/orgScope';
import { getPinnedProjectId, setPinnedProjectId } from '../utils/widgetPreferences';
import { patchWidgetSnapshot } from '../utils/widgetBridge';
import { HOME_SCREEN_WIDGETS_ENABLED } from '../utils/widgetFeatureFlags';

export default function WidgetPinnedProjectSheet({ visible, onClose }) {
  const { t } = useTranslation();
  const { user, supabase, activeOrganization } = useAuth();
  const [projects, setProjects] = useState([]);
  const [pinnedId, setPinnedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!HOME_SCREEN_WIDGETS_ENABLED || !visible) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [projectsData, storedPinned] = await Promise.all([
          user && supabase
            ? loadWithFallback(
                () => fetchUserProjectsWithProgress(supabase, user.id, { limit: 50 }),
                [],
                { label: 'widget_pinned_projects' },
              )
            : Promise.resolve([]),
          getPinnedProjectId(),
        ]);
        if (cancelled) return;
        const orgId = activeOrganization?.id;
        const scoped = orgId ? filterByOrganizationId(projectsData || [], orgId) : (projectsData || []);
        setProjects(scoped);
        setPinnedId(storedPinned);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [visible, user, supabase, activeOrganization?.id]);

  const handleSelect = async (projectId) => {
    setSaving(true);
    try {
      const nextId = projectId || null;
      await setPinnedProjectId(nextId);
      setPinnedId(nextId);
      const pinnedProject = nextId
        ? projects.find((p) => String(p.id) === String(nextId))
        : projects[0];
      await patchWidgetSnapshot({
        pinnedProject: pinnedProject
          ? {
              id: String(pinnedProject.id),
              name: pinnedProject.name || pinnedProject.title || 'Project',
              progressPct: Math.round(Number(pinnedProject.progress ?? pinnedProject.progress_pct ?? 0)),
            }
          : null,
      });
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  if (!HOME_SCREEN_WIDGETS_ENABLED) return null;

  return (
    <BottomSheet
      visible={visible}
      title={t('mobile.widget_pinned_project_title', { defaultValue: 'Widget project' })}
      onClose={onClose}
      snap="medium"
      testID="widget-pinned-project-sheet"
    >
      <BottomSheet.Scroll>
        <Text variant="bodyMedium" style={styles.help}>
          {t('mobile.widget_pinned_project_help', {
            defaultValue: 'Choose which project headline appears on your home screen widget.',
          })}
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : (
          <View style={styles.list}>
            <PressableWithFade
              style={[styles.row, !pinnedId && styles.rowSelected]}
              onPress={() => handleSelect(null)}
              disabled={saving}
              testID="widget-pinned-project-auto"
            >
              <Text variant="body">{t('mobile.widget_pinned_project_auto', { defaultValue: 'Most recent project' })}</Text>
            </PressableWithFade>
            {projects.map((project) => {
              const selected = String(pinnedId) === String(project.id);
              return (
                <PressableWithFade
                  key={project.id}
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => handleSelect(project.id)}
                  disabled={saving}
                  testID={`widget-pinned-project-${project.id}`}
                >
                  <Text variant="body" numberOfLines={1}>
                    {project.name}
                  </Text>
                  <Text variant="caption" style={styles.progress}>
                    {Math.round(Number(project.progress ?? 0))}%
                  </Text>
                </PressableWithFade>
              );
            })}
          </View>
        )}
      </BottomSheet.Scroll>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  help: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  loader: {
    marginVertical: spacing.lg,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowSelected: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  progress: {
    color: colors.textMuted,
  },
});
