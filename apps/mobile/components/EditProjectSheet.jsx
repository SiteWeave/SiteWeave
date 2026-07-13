import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { updateProject } from '@siteweave/core-logic';
import BottomSheet from './ui/BottomSheet';
import ProjectFormFields from './ProjectFormFields';
import { Text } from './ui/Text';
import { colors, spacing } from '../theme';

function projectToForm(project) {
  return {
    name: project?.name || '',
    address: project?.address || '',
    status: project?.status || 'Planning',
    project_type: project?.project_type || 'Residential',
    start_date: project?.start_date || null,
    due_date: project?.due_date || null,
  };
}

export default function EditProjectSheet({
  visible,
  project,
  supabase,
  userId,
  onClose,
  onSaved,
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState(projectToForm(project));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible || !project) return;
    setValues(projectToForm(project));
    setError(null);
  }, [visible, project?.id]);

  const handleSave = async () => {
    if (!supabase || !userId || !project?.id) return;
    if (!values.name?.trim()) {
      setError(t('mobile.project_name_required'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProject(supabase, project.id, { userId, fields: values });
      onSaved?.(updated);
      onClose?.();
    } catch (err) {
      setError(err.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      title={t('mobile.edit_project_title')}
      onClose={onClose}
      primaryLabel={t('common.save')}
      onPrimary={handleSave}
      primaryDisabled={saving || !values.name?.trim()}
      primaryLoading={saving}
      snap="medium"
      expandOnFocus
      stickyPrimary
      testID="edit-project-sheet"
    >
      <BottomSheet.Scroll>
        <ProjectFormFields values={values} onChange={setValues} disabled={saving} />
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
  error: { color: colors.error, marginTop: spacing.md },
});
