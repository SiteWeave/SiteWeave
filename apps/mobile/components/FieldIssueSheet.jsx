import { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  createProjectIssue,
  updateProjectIssue,
  todayIso,
  fetchIssueAssigneeOptions,
  resolveIssueAssigneePatch,
  isSmsNotificationsEnabled,
} from '@siteweave/core-logic';
import BottomSheet from './ui/BottomSheet';
import DateField from './ui/DateField';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import RemoteImage from './RemoteImage';
import { colors, spacing, touch, typography } from '../theme';
import { enqueueOfflineAction } from '../utils/offlineQueue';
import { persistOfflinePhotoUri } from '../utils/offlinePhotoStorage';
import { uploadIssuePhotoFromUri } from '../utils/uploadIssuePhoto';
import { alertPhotoUploadFailed } from '../utils/photoUploadFeedback';
import {
  runAfterInteractionsAsync,
  useAfterSheetDismiss,
} from '../utils/runAfterSheetDismiss';
import { IMAGE_MEDIA_TYPES } from '../utils/imagePickerMediaTypes';
import { loadFormDraft, saveFormDraft, clearFormDraft } from '../utils/formDrafts';

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
  const { scheduleAfterDismiss, handleDismissed, clearPending } = useAfterSheetDismiss();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate] = useState('');
  const [assignedToContactId, setAssignedToContactId] = useState('');
  const [assigneeOptions, setAssigneeOptions] = useState([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pickerSuspended, setPickerSuspended] = useState(false);
  const [notifyChannels, setNotifyChannels] = useState({
    email: true,
    app: true,
    sms: false,
  });
  const smsNotifyAvailable = isSmsNotificationsEnabled();
  const sheetVisible = visible && !pickerSuspended;

  useEffect(() => {
    if (!visible) {
      setPickerSuspended(false);
      clearPending();
      return;
    }
    let cancelled = false;
    (async () => {
      if (issueToEdit) {
        setTitle(issueToEdit?.title || '');
        setDescription(issueToEdit?.description || '');
        setLocation(issueToEdit?.location || '');
        setPriority(issueToEdit?.priority || 'Medium');
        setDueDate(issueToEdit?.due_date || todayIso());
        setAssignedToContactId(issueToEdit?.assigned_to_contact_id || '');
        setPhotoUri(null);
        setNotifyChannels({ email: true, app: true, sms: false });
        return;
      }
      const draft = await loadFormDraft('field_issue', projectId || 'default');
      if (cancelled) return;
      const data = draft?.data;
      setTitle(data?.title || '');
      setDescription(data?.description || '');
      setLocation(data?.location || '');
      setPriority(data?.priority || 'Medium');
      setDueDate(data?.dueDate || todayIso());
      setAssignedToContactId(data?.assignedToContactId || data?.assignedToUserId || '');
      setPhotoUri(data?.photoUri || null);
      setNotifyChannels(data?.notifyChannels || { email: true, app: true, sms: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, issueToEdit, clearPending, projectId]);

  useEffect(() => {
    if (!visible || issueToEdit) return undefined;
    const handle = setTimeout(() => {
      const hasContent =
        title.trim() ||
        description.trim() ||
        location.trim() ||
        photoUri ||
        assignedToContactId;
      if (!hasContent) {
        clearFormDraft('field_issue', projectId || 'default');
        return;
      }
      saveFormDraft('field_issue', projectId || 'default', {
        title,
        description,
        location,
        priority,
        dueDate,
        assignedToContactId,
        photoUri,
        notifyChannels,
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [
    visible,
    issueToEdit,
    projectId,
    title,
    description,
    location,
    priority,
    dueDate,
    assignedToContactId,
    photoUri,
    notifyChannels,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!visible || !supabase || !projectId) {
        setAssigneeOptions([]);
        return;
      }
      setAssigneesLoading(true);
      try {
        const opts = await fetchIssueAssigneeOptions(supabase, {
          projectId,
          organizationId,
          fallbackLabel: t('fieldIssues.team_member'),
        });
        if (!cancelled) setAssigneeOptions(opts);
      } catch (e) {
        console.warn('Failed to load issue assignees', e);
        if (!cancelled) setAssigneeOptions([]);
      } finally {
        if (!cancelled) setAssigneesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, supabase, projectId, organizationId, t]);

  const pickIssuePhoto = async (source) => {
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(t('common.error'), t('mobile.issue_photo_permission'));
          return;
        }
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: IMAGE_MEDIA_TYPES,
              quality: 0.8,
              allowsEditing: false,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: IMAGE_MEDIA_TYPES,
              quality: 0.8,
              allowsEditing: false,
            });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Field issue photo pick failed:', error);
      alertPhotoUploadFailed({
        t,
        message:
          error?.message ||
          t('mobile.issue_photo_failed', { defaultValue: 'Could not open the camera.' }),
        onRetake: () => {
          void runAfterInteractionsAsync(() => pickIssuePhoto(source));
        },
      });
    } finally {
      setPickerSuspended(false);
    }
  };

  const handleTakePhoto = () => {
    if (saving || pickerSuspended) return;
    scheduleAfterDismiss(() => {
      let sourceSelected = false;
      Alert.alert(t('mobile.issue_add_photo'), undefined, [
        {
          text: t('common.cancel'),
          style: 'cancel',
          onPress: () => setPickerSuspended(false),
        },
        {
          text: t('mobile.photo_take', { defaultValue: 'Take photo' }),
          onPress: () => {
            sourceSelected = true;
            void runAfterInteractionsAsync(() => pickIssuePhoto('camera'));
          },
        },
        {
          text: t('mobile.photo_library', { defaultValue: 'Choose from library' }),
          onPress: () => {
            sourceSelected = true;
            void runAfterInteractionsAsync(() => pickIssuePhoto('library'));
          },
        },
      ], {
        cancelable: true,
        onDismiss: () => {
          if (!sourceSelected) setPickerSuspended(false);
        },
      });
    }, () => setPickerSuspended(true));
  };

  const persistIssue = async () => {
    const assigneePatch = resolveIssueAssigneePatch(assignedToContactId, assigneeOptions);
    const hasAssignee = Boolean(
      assigneePatch.assigned_to_contact_id || assigneePatch.assigned_to_user_id,
    );
    const channelPayload = hasAssignee
      ? {
          email: notifyChannels.email,
          app: notifyChannels.app,
          sms: smsNotifyAvailable && notifyChannels.sms,
        }
      : undefined;
    const issuePayload = {
      project_id: projectId,
      organization_id: organizationId,
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      priority,
      due_date: dueDate || null,
      assigned_to_contact_id: assigneePatch.assigned_to_contact_id,
      assigned_to_user_id: assigneePatch.assigned_to_user_id,
      created_by_user_id: userId,
      bridgeToStream: true,
      notifyChannels: channelPayload,
    };

    setSaving(true);
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
              assigned_to_contact_id: assigneePatch.assigned_to_contact_id,
              assigned_to_user_id: assigneePatch.assigned_to_user_id,
            },
            {
              previousStatus: issueToEdit.status,
              bridgeToStream: true,
              notifyChannels: channelPayload,
            },
          )
        : await createProjectIssue(supabase, issuePayload);
      if (photoUri && issue?.id) {
        try {
          await uploadIssuePhotoFromUri(supabase, {
            issueId: issue.id,
            uri: photoUri,
            userId,
            organizationId,
          });
        } catch (photoError) {
          console.error('Field issue photo upload failed:', photoError);
          alertPhotoUploadFailed({
            t,
            message:
              photoError?.message ||
              t('mobile.photo_not_saved_message', {
                defaultValue: 'The photo did not upload. Retry, or take another.',
              }),
            onRetry: async () => {
              try {
                await uploadIssuePhotoFromUri(supabase, {
                  issueId: issue.id,
                  uri: photoUri,
                  userId,
                  organizationId,
                });
              } catch (retryError) {
                Alert.alert(
                  t('mobile.photo_not_saved_title', { defaultValue: 'Photo not saved' }),
                  retryError?.message ||
                    t('mobile.photo_not_saved_message', {
                      defaultValue: 'The photo did not upload. Retry, or take another.',
                    }),
                );
              }
            },
            onRetake: () => {
              // Issue already saved; user can add a photo from punch list later.
            },
          });
          await clearFormDraft('field_issue', projectId || 'default');
          onCreated?.();
          onClose?.();
          return;
        }
      }
      await clearFormDraft('field_issue', projectId || 'default');
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
      await clearFormDraft('field_issue', projectId || 'default');
      Alert.alert(t('mobile.offline_queued_title'), t('mobile.issue_queued'));
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !supabase || !userId || !projectId || !organizationId) return;

    if (!assignedToContactId) {
      Alert.alert(
        t('fieldIssues.assignee_label'),
        t('fieldIssues.assign_later_confirm', {
          defaultValue: 'No assignee selected. Create this issue unassigned?',
        }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.continue', { defaultValue: 'Continue' }), onPress: () => persistIssue() },
        ],
      );
      return;
    }

    await persistIssue();
  };

  return (
    <BottomSheet
      visible={sheetVisible}
      title={issueToEdit ? t('common.edit') : t('mobile.report_issue_title')}
      onClose={onClose}
      onDismissed={handleDismissed}
      dismissWithoutAnimation={pickerSuspended}
      primaryLabel={issueToEdit ? t('common.save') : t('mobile.report_issue_submit')}
      onPrimary={handleSave}
      primaryDisabled={saving || !title.trim() || pickerSuspended}
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
          {t('fieldIssues.assignee_label')}
        </Text>
        {assigneesLoading ? (
          <Text variant="caption" style={styles.hint}>
            {t('common.loading')}
          </Text>
        ) : null}
        {!assigneesLoading && assigneeOptions.length === 0 ? (
          <Text variant="caption" style={styles.hint}>
            {t('fieldIssues.no_project_assignees', {
              defaultValue: 'No one is on this project yet. Add people to the project team to assign.',
            })}
          </Text>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.assigneeRow}
        >
          <PressableWithFade
            style={[
              styles.assigneeChip,
              !assignedToContactId ? styles.chipActiveNeutral : styles.chipInactive,
            ]}
            onPress={() => setAssignedToContactId('')}
            disabled={saving}
          >
            <Text
              style={[
                styles.chipText,
                !assignedToContactId ? styles.chipTextActiveNeutral : styles.chipTextInactive,
              ]}
            >
              {t('mobile.task_assignee_none')}
            </Text>
          </PressableWithFade>
          {assigneeOptions.map((opt) => {
            const active = assignedToContactId === opt.contactId;
            return (
              <PressableWithFade
                key={opt.contactId}
                style={[
                  styles.assigneeChip,
                  active ? styles.chipActiveNeutral : styles.chipInactive,
                ]}
                onPress={() => setAssignedToContactId(opt.contactId)}
                disabled={saving}
              >
                <Text
                  style={[
                    styles.chipText,
                    active ? styles.chipTextActiveNeutral : styles.chipTextInactive,
                  ]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
              </PressableWithFade>
            );
          })}
        </ScrollView>

        {assignedToContactId ? (
          <View style={styles.notifyBlock}>
            <Text variant="caption" style={styles.label}>
              {t('fieldIssues.notify_channels')}
            </Text>
            {[
              { key: 'email', label: t('fieldIssues.notify_email') },
              { key: 'app', label: t('fieldIssues.notify_app') },
              ...(smsNotifyAvailable
                ? [{ key: 'sms', label: t('fieldIssues.notify_sms') }]
                : []),
            ].map((ch) => {
              const active = Boolean(notifyChannels[ch.key]);
              return (
                <PressableWithFade
                  key={ch.key}
                  style={styles.notifyRow}
                  onPress={() =>
                    setNotifyChannels((prev) => ({ ...prev, [ch.key]: !prev[ch.key] }))
                  }
                  disabled={saving}
                >
                  <Ionicons
                    name={active ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={active ? colors.primary : colors.textSubtle}
                  />
                  <Text style={styles.notifyLabel}>{ch.label}</Text>
                </PressableWithFade>
              );
            })}
          </View>
        ) : null}

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
          <RemoteImage
            uri={photoUri}
            style={styles.preview}
            accessibilityLabel={t('mobile.issue_photo_preview')}
          />
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
  hint: {
    color: colors.textMuted,
    marginBottom: spacing.sm,
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
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md },
  notifyBlock: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  notifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.minSize,
  },
  notifyLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
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
  assigneeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 180,
  },
  chipInactive: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  chipActiveNeutral: {
    backgroundColor: '#DBEAFE',
    borderColor: '#1D4ED8',
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  chipTextInactive: { color: colors.textSecondary },
  chipTextActiveNeutral: { color: '#1D4ED8', fontWeight: '700' },
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
