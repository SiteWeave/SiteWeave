import { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { createWalkthroughIssue } from '@siteweave/core-logic';
import BottomSheet from './ui/BottomSheet';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { colors, spacing, touch } from '../theme';
import { uploadIssueBeforePhotoFromUri } from '../utils/uploadIssuePhoto';

const IMAGE_MEDIA_TYPES = ImagePicker.MediaType?.Images
  ? [ImagePicker.MediaType.Images]
  : (ImagePicker.MediaTypeOptions?.Images ?? ['images']);

const DEFAULT_LOCATIONS = ['Kitchen', 'Master Bath', 'Living Room', 'Exterior', 'Garage'];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function FieldIssueWalkthroughSheet({
  visible,
  onClose,
  supabase,
  projectId,
  organizationId,
  userId,
  existingLocations = [],
  onCreated,
}) {
  const { t } = useTranslation();
  const [photoUri, setPhotoUri] = useState(null);
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [assigneeOptions, setAssigneeOptions] = useState([]);
  const [saving, setSaving] = useState(false);

  const locationChips = useMemo(() => {
    const fromIssues = (existingLocations || []).filter(Boolean);
    const merged = [...new Set([...DEFAULT_LOCATIONS, ...fromIssues])];
    return merged.slice(0, 12);
  }, [existingLocations]);

  useEffect(() => {
    if (!visible) return;
    setPhotoUri(null);
    setLocation('');
    setNote('');
    setAssignedToUserId('');
  }, [visible]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!visible || !supabase || !organizationId) {
        setAssigneeOptions([]);
        return;
      }
      try {
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('id, contacts:contact_id(name, email)')
          .eq('organization_id', organizationId);
        if (error) throw error;
        if (cancelled) return;
        setAssigneeOptions(
          (profiles || [])
            .map((p) => ({
              userId: p.id,
              label: p.contacts?.name || p.contacts?.email || t('fieldIssues.team_member'),
            }))
            .filter((o) => UUID_RE.test(o.userId)),
        );
      } catch (e) {
        console.warn('Failed to load walkthrough assignees', e);
        if (!cancelled) setAssigneeOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, supabase, organizationId, t]);

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

  const handleSaveAndNext = async () => {
    if (!photoUri) {
      Alert.alert(t('common.error'), t('punchList.photo_required'));
      return;
    }
    if (!location.trim()) {
      Alert.alert(t('common.error'), t('punchList.location_required'));
      return;
    }
    if (!supabase || !userId || !projectId || !organizationId) return;

    setSaving(true);
    try {
      const issue = await createWalkthroughIssue(supabase, {
        project_id: projectId,
        organization_id: organizationId,
        location: location.trim(),
        description: note.trim() || null,
        created_by_user_id: userId,
        assigned_to_user_id: assignedToUserId || null,
        priority: 'Medium',
      });
      if (issue?.id) {
        await uploadIssueBeforePhotoFromUri(supabase, {
          issueId: issue.id,
          uri: photoUri,
          userId,
          organizationId,
        });
      }
      onCreated?.();
      setPhotoUri(null);
      setNote('');
      Alert.alert(t('common.success'), t('punchList.item_saved_next'));
    } catch (error) {
      console.error('Walkthrough save failed', error);
      Alert.alert(t('common.error'), error.message || t('punchList.save_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      title={t('punchList.walkthrough_title')}
      onClose={onClose}
      primaryLabel={saving ? '…' : t('punchList.save_and_next')}
      onPrimary={handleSaveAndNext}
      primaryDisabled={saving}
      primaryLoading={saving}
      secondaryLabel={t('common.done')}
      onSecondary={onClose}
      snap="medium"
      expandOnFocus
      stickyPrimary
      testID="field-issue-walkthrough-sheet"
    >
      <BottomSheet.Scroll contentContainerStyle={styles.content}>
        <Text variant="caption" style={styles.hint}>
          {t('punchList.walkthrough_hint')}
        </Text>

        <PressableWithFade style={styles.photoBox} onPress={handleTakePhoto} testID="walkthrough-photo">
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera-outline" size={36} color={colors.textMuted} />
              <Text variant="caption" style={styles.photoLabel}>
                {t('punchList.tap_to_photo')}
              </Text>
            </View>
          )}
        </PressableWithFade>

        <Text variant="caption" style={styles.fieldLabel}>
          {t('punchList.location_label')}
        </Text>
        <View style={styles.chipRow}>
          {locationChips.map((chip) => {
            const active = location === chip;
            return (
              <PressableWithFade
                key={chip}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setLocation(chip)}
              >
                <Text variant="caption" style={[styles.chipText, active && styles.chipTextActive]}>
                  {chip}
                </Text>
              </PressableWithFade>
            );
          })}
        </View>
        <BottomSheet.Input
          value={location}
          onChangeText={setLocation}
          placeholder={t('punchList.location_placeholder')}
          style={styles.input}
          placeholderTextColor={colors.textSubtle}
          returnKeyType="next"
          testID="walkthrough-location"
        />

        <Text variant="caption" style={styles.fieldLabel}>
          {t('fieldIssues.assignee_label')}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.assigneeRow}
        >
          <PressableWithFade
            style={[styles.assigneeChip, !assignedToUserId && styles.chipActive]}
            onPress={() => setAssignedToUserId('')}
            disabled={saving}
          >
            <Text
              variant="caption"
              style={[styles.chipText, !assignedToUserId && styles.chipTextActive]}
            >
              {t('fieldIssues.assign_to')}
            </Text>
          </PressableWithFade>
          {assigneeOptions.map((opt) => {
            const active = assignedToUserId === opt.userId;
            return (
              <PressableWithFade
                key={opt.userId}
                style={[styles.assigneeChip, active && styles.chipActive]}
                onPress={() => setAssignedToUserId(opt.userId)}
                disabled={saving}
              >
                <Text
                  variant="caption"
                  style={[styles.chipText, active && styles.chipTextActive]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
              </PressableWithFade>
            );
          })}
        </ScrollView>

        <Text variant="caption" style={styles.fieldLabel}>
          {t('punchList.note_label')}
        </Text>
        <BottomSheet.Input
          value={note}
          onChangeText={setNote}
          placeholder={t('punchList.note_placeholder')}
          style={[styles.input, styles.noteInput]}
          placeholderTextColor={colors.textSubtle}
          multiline
          testID="walkthrough-note"
        />
      </BottomSheet.Scroll>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl, gap: spacing.sm },
  hint: { color: colors.textMuted, marginBottom: spacing.sm },
  photoBox: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 180,
    backgroundColor: colors.surfaceMuted,
  },
  photo: { width: '100%', height: 180 },
  photoPlaceholder: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  photoLabel: { color: colors.textMuted },
  fieldLabel: { color: colors.textMuted, marginTop: spacing.sm, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md },
  assigneeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    minHeight: touch.minSize * 0.75,
    justifyContent: 'center',
    maxWidth: 160,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    minHeight: touch.minSize * 0.75,
    justifyContent: 'center',
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { color: colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  noteInput: { minHeight: 72, textAlignVertical: 'top' },
});
