import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fetchUserProjectsWithProgress } from '@siteweave/core-logic';
import BottomSheet from './ui/BottomSheet';
import { ProjectSelectList } from './ui/ProjectPicker';
import { Text } from './ui/Text';
import { colors, spacing } from '../theme';
import { filterByOrganizationId } from '../utils/orgScope';

export default function IssueProjectPickerSheet({
  visible,
  onClose,
  onDismissed,
  supabase,
  userId,
  activeOrganization,
  onSelectProject,
}) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const loadProjects = useCallback(async () => {
    if (!supabase || !userId || !visible) return;
    setLoading(true);
    try {
      const data = await fetchUserProjectsWithProgress(supabase, userId, { limit: 50 });
      const scoped = activeOrganization?.id
        ? filterByOrganizationId(data || [], activeOrganization.id)
        : data || [];
      setProjects(scoped);
    } catch (error) {
      console.error('IssueProjectPickerSheet load failed:', error);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId, activeOrganization?.id, visible]);

  useEffect(() => {
    if (!visible) {
      setSelectedId(null);
      return;
    }
    loadProjects();
  }, [visible, loadProjects]);

  const recentProjects = useMemo(() => projects.slice(0, 3), [projects]);
  const otherProjects = useMemo(
    () => projects.filter((p) => !recentProjects.some((r) => r.id === p.id)),
    [projects, recentProjects],
  );

  const handleContinue = () => {
    const project = projects.find((p) => p.id === selectedId);
    if (!project) return;
    onSelectProject?.(project);
  };

  return (
    <BottomSheet
      visible={visible}
      title={t('mobile.issue_pick_project_title')}
      onClose={onClose}
      onDismissed={onDismissed}
      dismissWithoutAnimation
      primaryLabel={t('common.continue')}
      onPrimary={handleContinue}
      primaryDisabled={!selectedId}
      snap="medium"
      stickyPrimary
      testID="issue-project-picker"
    >
      <BottomSheet.Scroll>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : projects.length === 0 ? (
          <Text variant="bodyMedium" style={styles.empty}>
            {t('mobile.project_picker_empty')}
          </Text>
        ) : (
          <>
            {recentProjects.length > 0 ? (
              <View style={styles.section}>
                <Text variant="caption" style={styles.sectionLabel}>
                  {t('mobile.recent_projects')}
                </Text>
                <ProjectSelectList
                  projects={recentProjects}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  collapseWhenHidden={false}
                  testID="issue-recent-projects"
                />
              </View>
            ) : null}
            {otherProjects.length > 0 ? (
              <View style={styles.section}>
                {recentProjects.length > 0 ? (
                  <Text variant="caption" style={styles.sectionLabel}>
                    {t('mobile.all_projects')}
                  </Text>
                ) : null}
                <ProjectSelectList
                  projects={otherProjects}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  testID="issue-all-projects"
                />
              </View>
            ) : null}
          </>
        )}
      </BottomSheet.Scroll>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  loader: { marginVertical: spacing.xxl },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xxl },
  section: { marginBottom: spacing.md },
  sectionLabel: {
    color: colors.textSubtle,
    marginBottom: spacing.sm,
    fontWeight: '500',
  },
});
