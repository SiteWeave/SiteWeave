import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from './ui/BottomSheet';
import PressableWithFade from './PressableWithFade';
import { Text } from './ui/Text';
import { useAuth } from '../context/AuthContext';
import { reportContent, REPORT_REASONS } from '@siteweave/core-logic';
import { useHaptics } from '../hooks/useHaptics';
import { colors, spacing, touch } from '../theme';

export default function ReportContentModal({
  visible,
  onClose,
  contentType,
  contentId,
  reportedUserId,
  reportedUserName,
}) {
  const { t } = useTranslation();
  const { user, supabase } = useAuth();
  const haptics = useHaptics();
  const [selectedReason, setSelectedReason] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelectedReason(null);
    setDescription('');
  }, [visible]);

  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert(t('common.error'), t('mobile.report_content_reason_required'));
      return;
    }

    try {
      haptics.medium();
      setSubmitting(true);

      await reportContent(supabase, {
        contentType,
        contentId,
        reportedUserId,
        reportedByUserId: user.id,
        reason: selectedReason,
        description: description.trim() || null,
      });

      haptics.success();
      Alert.alert(t('mobile.report_content_success_title'), t('mobile.report_content_success_body'), [
        {
          text: t('common.confirm'),
          onPress: () => {
            setSelectedReason(null);
            setDescription('');
            onClose();
          },
        },
      ]);
    } catch (error) {
      console.error('Error reporting content:', error);
      haptics.error();
      Alert.alert(t('common.error'), t('mobile.report_content_error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      haptics.light();
      setSelectedReason(null);
      setDescription('');
      onClose();
    }
  };

  return (
    <BottomSheet
      visible={visible}
      title={t('mobile.report_content_title')}
      onClose={handleClose}
      primaryLabel={t('mobile.report_content_submit')}
      onPrimary={handleSubmit}
      primaryDisabled={!selectedReason || submitting}
      primaryLoading={submitting}
      snap="medium"
      expandOnFocus
      stickyPrimary
      testID="report-content-sheet"
    >
      <BottomSheet.Scroll>
        {reportedUserName ? (
          <View style={styles.infoSection}>
            <Text variant="bodyMedium" style={styles.infoText}>
              {t('mobile.report_content_from', { name: reportedUserName })}
            </Text>
          </View>
        ) : null}

        <Text variant="caption" style={styles.label}>
          {t('mobile.report_content_reason_label')}
        </Text>
        {REPORT_REASONS.map((reason) => (
          <PressableWithFade
            key={reason.value}
            style={[styles.reasonOption, selectedReason === reason.value && styles.reasonOptionSelected]}
            onPress={() => {
              haptics.selection();
              setSelectedReason(reason.value);
            }}
            disabled={submitting}
          >
            <View style={styles.reasonContent}>
              <View
                style={[
                  styles.radioButton,
                  selectedReason === reason.value && styles.radioButtonSelected,
                ]}
              >
                {selectedReason === reason.value ? <View style={styles.radioButtonInner} /> : null}
              </View>
              <Text
                style={[
                  styles.reasonLabel,
                  selectedReason === reason.value && styles.reasonLabelSelected,
                ]}
              >
                {reason.label}
              </Text>
            </View>
          </PressableWithFade>
        ))}

        <Text variant="caption" style={styles.label}>
          {t('mobile.report_content_details_label')}
        </Text>
        <BottomSheet.Input
          style={styles.textInput}
          value={description}
          onChangeText={setDescription}
          placeholder={t('mobile.report_content_details_placeholder')}
          placeholderTextColor={colors.textSubtle}
          multiline
          numberOfLines={4}
          editable={!submitting}
          textAlignVertical="top"
        />
      </BottomSheet.Scroll>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  infoSection: {
    padding: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    marginBottom: spacing.md,
  },
  infoText: { color: colors.textSecondary },
  label: {
    color: colors.textSubtle,
    fontWeight: '500',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  reasonOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: touch.minRowHeight,
    justifyContent: 'center',
  },
  reasonOptionSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  reasonContent: { flexDirection: 'row', alignItems: 'center' },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textSubtle,
    marginRight: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: { borderColor: colors.primary },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  reasonLabel: { fontSize: 16, color: colors.text, flex: 1 },
  reasonLabelSelected: { fontWeight: '600' },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    fontSize: 17,
    fontWeight: '500',
    color: colors.text,
    minHeight: 100,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
});
