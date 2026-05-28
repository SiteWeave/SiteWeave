import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { submitUserFeedback } from '@siteweave/core-logic';
import { useAuth } from '../context/AuthContext';
import PressableWithFade from './PressableWithFade';
import { useHaptics } from '../hooks/useHaptics';

const FEEDBACK_TYPE_KEYS = [
  { value: 'bug', labelKey: 'settings.feedback_type_bug' },
  { value: 'feature', labelKey: 'settings.feedback_type_feature' },
  { value: 'general', labelKey: 'settings.feedback_type_general' },
];

export default function FeedbackModal({ visible, onClose }) {
  const { t } = useTranslation();
  const { user, supabase } = useAuth();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const [feedbackType, setFeedbackType] = useState('bug');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    if (!submitting) {
      haptics.light();
      setSubject('');
      setMessage('');
      setFeedbackType('bug');
      onClose();
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
      Alert.alert(
        t('common.success'),
        t('mobile.feedback_thanks'),
        [
          {
            text: t('common.done'),
            onPress: () => {
              setSubject('');
              setMessage('');
              setFeedbackType('bug');
              onClose();
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting feedback:', error);
      haptics.error();
      Alert.alert(
        t('common.error'),
        error.message || t('mobile.feedback_failed')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      testID="feedback-modal"
    >
      <KeyboardAvoidingView
        style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('settings.send_feedback')}</Text>
            <PressableWithFade
              style={styles.closeButton}
              onPress={handleClose}
              disabled={submitting}
              accessibilityLabel={t('mobile.close_feedback')}
            >
              <Ionicons name="close" size={24} color="#111827" />
            </PressableWithFade>
          </View>

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('settings.feedback_type_label')}</Text>
              {FEEDBACK_TYPE_KEYS.map((type) => (
                <PressableWithFade
                  key={type.value}
                  style={[
                    styles.typeOption,
                    feedbackType === type.value && styles.typeOptionSelected,
                  ]}
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
                      {feedbackType === type.value && <View style={styles.radioButtonInner} />}
                    </View>
                    <Text
                      style={[
                        styles.typeLabel,
                        feedbackType === type.value && styles.typeLabelSelected,
                      ]}
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
                placeholderTextColor="#9CA3AF"
                editable={!submitting}
                maxLength={200}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('settings.feedback_message')} *</Text>
              <TextInput
                style={[styles.textInput, styles.messageInput]}
                value={message}
                onChangeText={setMessage}
                placeholder={t('settings.feedback_message_placeholder')}
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={8}
                editable={!submitting}
                maxLength={2000}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>
                {t('settings.feedback_char_count', { count: message.length })}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <PressableWithFade
              style={[styles.cancelButton, submitting && styles.buttonDisabled]}
              onPress={handleClose}
              disabled={submitting}
              testID="feedback-cancel"
            >
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </PressableWithFade>
            <PressableWithFade
              style={[
                styles.submitButton,
                (submitting || !subject.trim() || !message.trim()) && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitting || !subject.trim() || !message.trim()}
              testID="feedback-submit"
            >
              <Text style={styles.submitButtonText}>
                {submitting ? t('settings.feedback_submitting') : t('settings.send_feedback')}
              </Text>
            </PressableWithFade>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  typeOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  typeOptionSelected: {
    backgroundColor: '#DBEAFE',
    borderColor: '#3B82F6',
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
    borderColor: '#D1D5DB',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonSelected: {
    borderColor: '#3B82F6',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3B82F6',
  },
  typeLabel: {
    fontSize: 15,
    color: '#374151',
  },
  typeLabelSelected: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff',
  },
  messageInput: {
    minHeight: 160,
  },
  charCount: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
