import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { createProject, canCreateProject, fetchUserProjectsWithProgress } from '@siteweave/core-logic';
import BottomSheet from './ui/BottomSheet';
import ProjectFormFields from './ProjectFormFields';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { colors, spacing } from '../theme';
import { ensureOrganizationForWrites } from '../utils/organizationContext';
import { filterByOrganizationId } from '../utils/orgScope';
import {
  incrementProjectsCreatedCount,
  getRecentProjectAddresses,
  getLastUpdatedProject,
  buildDuplicateProjectValues,
} from '../utils/projectCreate';

const EMPTY_FORM = {
  name: '',
  address: '',
  status: 'Planning',
  project_type: 'Residential',
  start_date: null,
  due_date: null,
};

export default function CreateProjectSheet({
  visible,
  supabase,
  userId,
  activeOrganization,
  onClose,
  onCreated,
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [recentProjects, setRecentProjects] = useState([]);

  const loadContext = useCallback(async () => {
    if (!supabase || !userId) return;
    try {
      const data = await fetchUserProjectsWithProgress(supabase, userId, { limit: 50 });
      const scoped = activeOrganization?.id
        ? filterByOrganizationId(data || [], activeOrganization.id)
        : data || [];
      setRecentProjects(scoped);
    } catch {
      setRecentProjects([]);
    }
  }, [supabase, userId, activeOrganization?.id]);

  useEffect(() => {
    if (!visible) return;
    setValues(EMPTY_FORM);
    setError(null);
    setShowMoreDetails(false);
    loadContext();
  }, [visible, loadContext]);

  const recentAddresses = useMemo(
    () => getRecentProjectAddresses(recentProjects),
    [recentProjects],
  );

  const lastProject = useMemo(() => getLastUpdatedProject(recentProjects), [recentProjects]);

  const handleDuplicateLast = () => {
    const duplicate = buildDuplicateProjectValues(lastProject);
    if (duplicate) {
      setValues(duplicate);
      setShowMoreDetails(false);
    }
  };

  const handleSave = async () => {
    if (!supabase || !userId) return;
    if (!values.name?.trim()) {
      setError(t('mobile.project_name_required'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const orgResult = await ensureOrganizationForWrites(supabase, {
        userId,
        currentOrganization: activeOrganization,
      });
      if (!orgResult.ok) {
        throw new Error(orgResult.error);
      }

      const allowed = await canCreateProject(supabase, orgResult.organizationId);
      if (!allowed) {
        throw new Error(t('mobile.create_project_limit'));
      }

      const created = await createProject(supabase, {
        userId,
        organizationId: orgResult.organizationId,
        fields: values,
      });
      await incrementProjectsCreatedCount();
      onCreated?.(created);
      onClose?.();
    } catch (err) {
      setError(err.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const primaryDisabled = saving || !values.name?.trim();

  const duplicateFooter = lastProject ? (
    <PressableWithFade
      style={styles.duplicateBtn}
      onPress={handleDuplicateLast}
      disabled={saving}
      testID="create-project-duplicate"
    >
      <Ionicons name="copy-outline" size={15} color={colors.primary} />
      <Text variant="caption" style={styles.duplicateBtnText} numberOfLines={1}>
        {t('mobile.duplicate_last_project')}
      </Text>
    </PressableWithFade>
  ) : null;

  return (
    <BottomSheet
      visible={visible}
      title={t('mobile.create_project_title')}
      onClose={onClose}
      primaryLabel={t('mobile.create_project_save')}
      onPrimary={handleSave}
      primaryDisabled={primaryDisabled}
      primaryLoading={saving}
      primaryPlacement="footer"
      snap="medium"
      maxSnap="fullscreen"
      expandOnFocus
      expandOnFocusSnap="large"
      allowExpand
      expandDragThreshold={-45}
      expandVelocityThreshold={-0.55}
      yOffset={-20}
      stickyPrimary
      footerContent={duplicateFooter}
      closeVariant="minimal"
      closePosition="right"
      testID="create-project-sheet"
    >
      <BottomSheet.Scroll>
        <ProjectFormFields
          values={values}
          onChange={setValues}
          disabled={saving}
          compact={!showMoreDetails}
          recentAddresses={recentAddresses}
          dateRangeActive={visible}
        />
        <PressableWithFade
          style={styles.moreToggle}
          onPress={() => setShowMoreDetails((v) => !v)}
          disabled={saving}
          testID="create-project-more-details"
        >
          <Text variant="bodyMedium" style={styles.moreToggleText}>
            {showMoreDetails
              ? t('mobile.create_project_less_details')
              : t('mobile.create_project_more_details')}
          </Text>
          <Ionicons
            name={showMoreDetails ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.primary}
          />
        </PressableWithFade>

        {error ? (
          <Text variant="caption" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </BottomSheet.Scroll>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  duplicateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 36,
    maxWidth: '100%',
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  duplicateBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
    flexShrink: 1,
  },
  error: { color: colors.error, marginTop: spacing.md },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  moreToggleText: { color: colors.primary, fontWeight: '600' },
});
