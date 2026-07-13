import { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { createProjectIssue, updateProjectIssue, todayIso } from '@siteweave/core-logic';
import BottomSheet from './ui/BottomSheet';
import DateField from './ui/DateField';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { colors, spacing, touch, typography } from '../theme';
import { enqueueOfflineAction } from '../utils/offlineQueue';
import { persistOfflinePhotoUri } from '../utils/offlinePhotoStorage';
import { uploadIssuePhotoFromUri } from '../utils/uploadIssuePhoto';

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

const SEVERITY_KEYS = {
  Low: 'fieldIssues.priority_low',
  Medium: 'fieldIssues.priority_medium',
  High: 'fieldIssues.priority_high',
  Critical: 'fieldIssues.priority_critical',
};

const SEVERITY_STYLES = {
  Low: { bg: '#DCFCE7', text: '#166534' },
  Medium: { bg: '#FEF9C3', text: '#854D0E' },
  High: { bg: '#FFEDD5', text: '#9A3412' },
  Critical: { bg: '#FEE2E2', text: '#991B1B' },
};

const IMAGE_MEDIA_TYPES = ImagePicker.MediaType?.Images
  ? [ImagePicker.MediaType.Images]
  : (ImagePicker.MediaTypeOptions?.Images ?? ['images']);

export default function FieldIssueSheet({
  visible,
  onClose,
  supabase,
  projectId,
  organizationId,
  userId,
  onCreated,
  issueToEdit = null,
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(issueToEdit?.title || '');
    setDescription(issueToEdit?.description || '');
    setLocation(issueToEdit?.location || '');
    setPriority(issueToEdit?.priority || 'Medium');
    setDueDate(issueToEdit?.due_date || todayIso());
    setPhotoUri(null);
  }, [visible, issueToEdit]);

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('common.error'), t('mobile.issue_photo_permission'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: IMAGE_MEDIA_TYPES,
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !supabase || !userId || !projectId || !organizationId) return;

    setSaving(true);
    const issuePayload = {
      project_id: projectId,
      organization_id: organizationId,
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      priority,
      due_date: dueDate || null,
      created_by_user_id: userId,
      bridgeToStream: true,
    };

    try {
      const issue = issueToEdit?.id
        ? await updateProjectIssue(
            supabase,
            issueToEdit.id,
            {
              title: issuePayload.title,
              description: issuePayload.description,
              location: issuePayload.location,
              priority: issuePayload.priority,
              due_date: issuePayload.due_date,
            },
            { previousStatus: issueToEdit.status, bridgeToStream: true },
          )
        : await createProjectIssue(supabase, issuePayload);
      if (photoUri && issue?.id) {
        await uploadIssuePhotoFromUri(supabase, {
          issueId: issue.id,
          uri: photoUri,
          userId,
          organizationId,
        });
      }
      Alert.alert(
        t('common.success'),
        issueToEdit ? t('common.save') : t('mobile.issue_reported'),
      );
      onCreated?.();
      onClose?.();
    } catch (error) {
      console.error('Field issue create failed:', error);
      if (issueToEdit?.id) {
        Alert.alert(t('common.error'), error.message || t('fieldIssues.save_error'));
        return;
      }
      let localPhotoUri = null;
      if (photoUri) {
        try {
          localPhotoUri = await persistOfflinePhotoUri(photoUri);
        } catch {
          // still queue issue text
        }
      }
      await enqueueOfflineAction({
        type: 'create_issue',
        payload: { ...issuePayload, localPhotoUri },
      });
      Alert.alert(t('mobile.offline_queued_title'), t('mobile.issue_queued'));
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      title={issueToEdit ? t('common.edit') : t('mobile.report_issue_title')}
      onClose={onClose}
      primaryLabel={issueToEdit ? t('common.save') : t('mobile.report_issue_submit')}
      onPrimary={handleSave}
      primaryDisabled={saving || !title.trim()}
      primaryLoading={saving}
      snap="medium"
      maxSnap="large"
      expandOnFocus
      stickyPrimary
      primaryPlacement="footer"
      closeVariant="minimal"
      closePosition="right"
      testID="field-issue-sheet"
    >
      <BottomSheet.Scroll>
        <Text variant="caption" style={[styles.label, styles.labelFirst]}>
          {t('mobile.issue_title_label')}
        </Text>
        <BottomSheet.Input
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={t('mobile.issue_title_placeholder')}
          placeholderTextColor={colors.textSubtle}
          editable={!saving}
        />

        <Text variant="caption" style={styles.label}>
          {t('mobile.issue_description_label')}
        </Text>
        <BottomSheet.Input
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder={t('mobile.issue_description_placeholder')}
          placeholderTextColor={colors.textSubtle}
          editable={!saving}
        />

        <Text variant="caption" style={styles.label}>
          {t('punchList.location_label')}
        </Text>
        <BottomSheet.Input
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder={t('punchList.location_placeholder')}
          placeholderTextColor={colors.textSubtle}
          editable={!saving}
        />

        <Text variant="caption" style={styles.label}>
          {t('fieldIssues.priority_label')}
        </Text>
        <View style={styles.chipRow}>
          {PRIORITIES.map((level) => {
            const active = priority === level;
            const severity = SEVERITY_STYLES[level];
            return (
              <PressableWithFade
                key={level}
                style={[
                  styles.chip,
                  active
                    ? { backgroundColor: severity.bg, borderColor: severity.text }
                    : styles.chipInactive,
                ]}
                onPress={() => setPriority(level)}
                disabled={saving}
              >
                <Text
                  style={[
                    styles.chipText,
                    active ? { color: severity.text, fontWeight: '700' } : styles.chipTextInactive,
                  ]}
                >
                  {t(SEVERITY_KEYS[level])}
                </Text>
              </PressableWithFade>
            );
          })}
        </View>

        <DateField
          label={t('mobile.event_date_label')}
          value={dueDate}
          onChange={setDueDate}
          disabled={saving}
          allowClear
          testID="field-issue-due-date"
        />

        <PressableWithFade style={styles.photoBtn} onPress={handleTakePhoto} disabled={saving}>
          <Ionicons name="camera-outline" size={22} color={colors.primary} />
          <Text variant="bodyMedium" style={styles.photoBtnText}>
            {photoUri ? t('mobile.issue_retake_photo') : t('mobile.issue_add_photo')}
          </Text>
        </PressableWithFade>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.preview} accessibilityLabel={t('mobile.issue_photo_preview')} />
        ) : null}
      </BottomSheet.Scroll>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    color: colors.textSubtle,
    fontWeight: '500',
    ...typography.caption,
  },
  labelFirst: {
    marginTop: 0,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 17,
    fontWeight: '500',
    minHeight: touch.minSize,
    color: colors.text,
    backgroundColor: colors.surface,
    textAlignVertical: 'center',
  },
  textArea: { minHeight: 88, textAlignVertical: 'top', paddingVertical: spacing.lg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flex: 1,
    minWidth: '22%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipInactive: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  chipTextInactive: { color: colors.textSecondary },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    minHeight: touch.minSize,
  },
  photoBtnText: { color: colors.primary, fontWeight: '600' },
  preview: {
    marginTop: spacing.md,
    width: '100%',
    height: 160,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
});
