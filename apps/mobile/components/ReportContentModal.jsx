import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, Alert, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PressableWithFade from './PressableWithFade';
import { useAuth } from '../context/AuthContext';
import { reportContent, REPORT_REASONS } from '@siteweave/core-logic';
import { useHaptics } from '../hooks/useHaptics';

export default function ReportContentModal({ visible, onClose, contentType, contentId, reportedUserId, reportedUserName }) {
  const { user, supabase } = useAuth();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const [selectedReason, setSelectedReason] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert('Required', 'Please select a reason for reporting this content.');
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
      Alert.alert(
        'Report Submitted',
        'Thank you for your report. We will review it and take appropriate action.',
        [
          {
            text: 'OK',
            onPress: () => {
              setSelectedReason(null);
              setDescription('');
              onClose();
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error reporting content:', error);
      haptics.error();
      Alert.alert('Error', 'Failed to submit report. Please try again.');
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
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Report Content</Text>
            <PressableWithFade
              style={styles.closeButton}
              onPress={handleClose}
              disabled={submitting}
            >
              <Ionicons name="close" size={24} color="#111827" />
            </PressableWithFade>
          </View>

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {reportedUserName && (
              <View style={styles.infoSection}>
                <Text style={styles.infoText}>
                  Reporting content from: <Text style={styles.boldText}>{reportedUserName}</Text>
                </Text>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Reason for Report</Text>
              {REPORT_REASONS.map((reason) => (
                <PressableWithFade
                  key={reason.value}
                  style={[
                    styles.reasonOption,
                    selectedReason === reason.value && styles.reasonOptionSelected,
                  ]}
                  onPress={() => {
                    haptics.selection();
                    setSelectedReason(reason.value);
                  }}
                  disabled={submitting}
                >
                  <View style={styles.reasonContent}>
                    <View style={[
                      styles.radioButton,
                      selectedReason === reason.value && styles.radioButtonSelected,
                    ]}>
                      {selectedReason === reason.value && (
                        <View style={styles.radioButtonInner} />
                      )}
                    </View>
                    <Text style={[
                      styles.reasonLabel,
                      selectedReason === reason.value && styles.reasonLabelSelected,
                    ]}>
                      {reason.label}
                    </Text>
                  </View>
                </PressableWithFade>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Additional Details (Optional)</Text>
              <TextInput
                style={styles.textInput}
                value={description}
                onChangeText={setDescription}
                placeholder="Provide any additional context..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                editable={!submitting}
                textAlignVertical="top"
              />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <PressableWithFade
              style={[styles.cancelButton, submitting && styles.buttonDisabled]}
              onPress={handleClose}
              disabled={submitting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </PressableWithFade>
            <PressableWithFade
              style={[
                styles.submitButton,
                (!selectedReason || submitting) && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!selectedReason || submitting}
            >
              <Text style={styles.submitButtonText}>
                {submitting ? 'Submitting...' : 'Submit Report'}
              </Text>
            </PressableWithFade>
          </View>
        </View>
      </View>
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
    maxHeight: '90%',
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
  },
  scrollView: {
    flex: 1,
  },
  infoSection: {
    padding: 20,
    backgroundColor: '#F3F4F6',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#4B5563',
  },
  boldText: {
    fontWeight: '600',
    color: '#111827',
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
  reasonOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reasonOptionSelected: {
    backgroundColor: '#DBEAFE',
    borderColor: '#3B82F6',
  },
  reasonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
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
  reasonLabel: {
    fontSize: 16,
    color: '#111827',
  },
  reasonLabelSelected: {
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    minHeight: 100,
    backgroundColor: '#F9FAFB',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
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

