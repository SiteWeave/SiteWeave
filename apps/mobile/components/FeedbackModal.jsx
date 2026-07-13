import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { submitUserFeedback } from '@siteweave/core-logic';
import { useAuth } from '../context/AuthContext';
import PressableWithFade from './PressableWithFade';
import BottomSheet from './ui/BottomSheet';
import { useHaptics } from '../hooks/useHaptics';
import { colors, spacing, touch } from '../theme';

const FEEDBACK_TYPE_KEYS = [
  { value: 'bug', labelKey: 'settings.feedback_type_bug' },
  { value: 'feature', labelKey: 'settings.feedback_type_feature' },
  { value: 'general', labelKey: 'settings.feedback_type_general' },
];

export default function FeedbackModal({ visible, onClose }) {
  const { t } = useTranslation();
  const { user, supabase } = useAuth();
  const haptics = useHaptics();
  const [feedbackType, setFeedbackType] = useState('bug');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFeedbackType('bug');
    setSubject('');
    setMessage('');
    setSubmitting(false);
  }, [visible]);

  const resetAndClose = () => {
    setSubject('');
    setMessage('');
    setFeedbackType('bug');
    onClose();
  };

  const handleClose = () => {
    if (!submitting) {
      haptics.light();
      resetAndClose();
    }
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert(t('mobile.feedback_required'), t('mobile.feedback_fill_both'));
      return;
    }

    if (!user || !supabase) {
      Alert.alert(t('common.error'), t('mobile.feedback_sign_in'));
      return;
    }

    try {
      haptics.medium();
      setSubmitting(true);

      await submitUserFeedback(supabase, {
        user,
        feedbackType,
        subject,
        message,
        appVersion: Constants.expoConfig?.version ?? 'mobile',
        platform: 'mobile',
      });

      haptics.success();
      Alert.alert(t('common.success'), t('mobile.feedback_thanks'), [
        {
          text: t('common.done'),
          onPress: resetAndClose,
        },
      ]);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      haptics.error();
      Alert.alert(t('common.error'), error.message || t('mobile.feedback_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = Boolean(subject.trim() && message.trim());

  return (
    <BottomSheet
      visible={visible}
      title={t('settings.send_feedback')}
      onClose={handleClose}
      primaryLabel={t('settings.send_feedback')}
      onPrimary={handleSubmit}
      primaryDisabled={submitting || !canSubmit}
      primaryLoading={submitting}
      snap="medium"
      expandOnFocus
      stickyPrimary
      testID="feedback-modal"
    >
      <BottomSheet.Scroll>
        <Text style={styles.description}>{t('settings.feedback_description')}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.feedback_type_label')}</Text>
          {FEEDBACK_TYPE_KEYS.map((type) => (
            <PressableWithFade
              key={type.value}
              style={[styles.typeOption, feedbackType === type.value && styles.typeOptionSelected]}
              onPress={() => {
                haptics.selection();
                setFeedbackType(type.value);
              }}
              disabled={submitting}
            >
              <View style={styles.typeContent}>
                <View
                  style={[
                    styles.radioButton,
                    feedbackType === type.value && styles.radioButtonSelected,
                  ]}
                >
                  {feedbackType === type.value ? <View style={styles.radioButtonInner} /> : null}
                </View>
                <Text
                  style={[styles.typeLabel, feedbackType === type.value && styles.typeLabelSelected]}
                >
                  {t(type.labelKey)}
                </Text>
              </View>
            </PressableWithFade>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.feedback_subject')} *</Text>
          <TextInput
            style={styles.textInput}
            value={subject}
            onChangeText={setSubject}
            placeholder={t('settings.feedback_subject_placeholder')}
            placeholderTextColor={colors.textSubtle}
            editable={!submitting}
            maxLength={200}
            testID="feedback-subject"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.feedback_message')} *</Text>
          <TextInput
            style={[styles.textInput, styles.messageInput]}
            value={message}
            onChangeText={setMessage}
            placeholder={t('settings.feedback_message_placeholder')}
            placeholderTextColor={colors.textSubtle}
            multiline
            editable={!submitting}
            maxLength={2000}
            textAlignVertical="top"
            testID="feedback-message"
          />
          <Text style={styles.charCount}>
            {t('settings.feedback_char_count', { count: message.length })}
          </Text>
        </View>
      </BottomSheet.Scroll>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  typeOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 10,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: touch.minRowHeight - 8,
    justifyContent: 'center',
  },
  typeOptionSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  typeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonSelected: {
    borderColor: colors.primary,
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  typeLabel: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  typeLabelSelected: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    minHeight: touch.minSize,
  },
  messageInput: {
    minHeight: 140,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'right',
  },
});
