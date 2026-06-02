import { View, Text, StyleSheet, Modal, ScrollView, Animated, Dimensions } from 'react-native';
import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { completeTask } from '@siteweave/core-logic';
import PressableWithFade from './PressableWithFade';
import ModalScrim from './ui/ModalScrim';
import { useHaptics } from '../hooks/useHaptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MyDayItemModal({ visible, item, onClose, onComplete, onAddPhoto, photoUploading = false }) {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const haptics = useHaptics();
  
  const modalTranslateY = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      haptics.light();
      modalTranslateY.setValue(1);
      requestAnimationFrame(() => {
        Animated.timing(modalTranslateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    } else {
      modalTranslateY.setValue(1);
    }
  }, [visible, modalTranslateY]);

  if (!item) return null;

  const isTask = item.type === 'task';
  const isEvent = item.type === 'event';

  const handleCompleteTask = async () => {
    if (isTask && item.id) {
      try {
        haptics.medium();
        await completeTask(supabase, item.id);
        haptics.success();
        onComplete?.();
        onClose();
      } catch (error) {
        console.error('Error completing task:', error);
        haptics.error();
      }
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return '#EF4444';
      case 'medium':
        return '#F59E0B';
      case 'low':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <ModalScrim onPress={onClose} opacity={0.5} />
        
        <View style={styles.modalWrapper}>
          <Animated.View 
            style={[
              styles.modal,
              {
                transform: [{ translateY: modalTranslateY.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, SCREEN_HEIGHT],
                }) }],
              }
            ]}
          >
          <View style={styles.header}>
            <Text style={styles.modalTitle}>
              {isTask ? 'Task Details' : isEvent ? 'Event Details' : 'Item Details'}
            </Text>
            <PressableWithFade 
              onPress={() => {
                haptics.light();
                onClose();
              }} 
              style={styles.closeButton}
              hapticType="light"
            >
              <Ionicons name="close" size={24} color="#111827" />
            </PressableWithFade>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {isTask && (
              <>
                <Text style={styles.title}>{item.text || item.title}</Text>
                {item.description && (
                  <Text style={styles.description}>{item.description}</Text>
                )}
                {item.due_date && (
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                    <Text style={styles.detailText}>
                      Due: {formatDate(item.due_date)} {item.due_date && formatTime(item.due_date)}
                    </Text>
                  </View>
                )}
                {item.priority && (
                  <View style={styles.detailRow}>
                    <Ionicons name="flag-outline" size={20} color={getPriorityColor(item.priority)} />
                    <Text style={[styles.detailText, { color: getPriorityColor(item.priority) }]}>
                      Priority: {item.priority}
                    </Text>
                  </View>
                )}
                {item.project_id && (
                  <View style={styles.detailRow}>
                    <Ionicons name="folder-outline" size={20} color="#6B7280" />
                    <Text style={styles.detailText}>Project Task</Text>
                  </View>
                )}
              </>
            )}

            {isEvent && (
              <>
                <Text style={styles.title}>{item.title}</Text>
                {item.description && (
                  <Text style={styles.description}>{item.description}</Text>
                )}
                {item.start_time && (
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={20} color="#3B82F6" />
                    <Text style={styles.detailText}>
                      {formatTime(item.start_time)}
                      {item.end_time && ` - ${formatTime(item.end_time)}`}
                    </Text>
                  </View>
                )}
                {item.start_time && (
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                    <Text style={styles.detailText}>{formatDate(item.start_time)}</Text>
                  </View>
                )}
                {item.location && (
                  <View style={styles.detailRow}>
                    <Ionicons name="location-outline" size={20} color="#6B7280" />
                    <Text style={styles.detailText}>{item.location}</Text>
                  </View>
                )}
                {item.category && (
                  <View style={styles.detailRow}>
                    <Ionicons name="pricetag-outline" size={20} color="#6B7280" />
                    <Text style={styles.detailText}>Category: {item.category}</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {isTask && !item.completed && (
            <View style={styles.actions}>
              {item.project_id && onAddPhoto ? (
                <PressableWithFade
                  style={[styles.photoButton, photoUploading && styles.photoButtonDisabled]}
                  onPress={() => onAddPhoto(item)}
                  disabled={photoUploading}
                  hapticType="light"
                  testID="my-day-modal-add-photo"
                >
                  <Ionicons name="camera-outline" size={20} color="#3B82F6" />
                  <Text style={styles.photoButtonText}>{t('mobile.add_photo')}</Text>
                </PressableWithFade>
              ) : null}
              <PressableWithFade
                style={styles.completeButton}
                onPress={handleCompleteTask}
                hapticType="medium"
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.completeButtonText}>{t('mobile.mark_complete')}</Text>
              </PressableWithFade>
            </View>
          )}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    position: 'relative',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '40%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#4B5563',
    lineHeight: 24,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  detailText: {
    fontSize: 16,
    color: '#4B5563',
  },
  actions: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    gap: 8,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  photoButtonDisabled: {
    opacity: 0.5,
  },
  photoButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '600',
  },
  completeButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    gap: 8,
    minHeight: 44,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

