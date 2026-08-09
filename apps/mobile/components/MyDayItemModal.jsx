import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Animated,
  Dimensions,
  InteractionManager,
} from 'react-native';
import { useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { completeTask } from '@siteweave/core-logic';
import PressableWithFade from './PressableWithFade';
import ModalScrim from './ui/ModalScrim';
import { useHaptics } from '../hooks/useHaptics';
import { signalReviewPromptOpportunity } from '../utils/reviewPromptEvents';
import { colors, spacing, radius, touch } from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MyDayItemModal({
  visible,
  item,
  onClose,
  onDismissed,
  onComplete,
  onCompleteFailed,
  onAddPhoto,
  photoUploading = false,
}) {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();

  const modalTranslateY = useRef(new Animated.Value(1)).current;
  const wasVisibleRef = useRef(false);
  const dismissNotifiedRef = useRef(false);

  const notifyDismissed = useCallback(() => {
    if (!wasVisibleRef.current || dismissNotifiedRef.current) return;
    dismissNotifiedRef.current = true;
    wasVisibleRef.current = false;
    onDismissed?.();
  }, [onDismissed]);

  useEffect(() => {
    if (visible) {
      wasVisibleRef.current = true;
      dismissNotifiedRef.current = false;
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
      const task = InteractionManager.runAfterInteractions(notifyDismissed);
      return () => task.cancel?.();
    }
    return undefined;
  }, [visible, modalTranslateY, notifyDismissed]);

  if (!item) return null;

  const isTask = item.type === 'task';
  const isEvent = item.type === 'event';

  const handleCompleteTask = async () => {
    if (isTask && item.id) {
      try {
        haptics.medium();
        onComplete?.(item);
        onClose();
        await completeTask(supabase, item.id);
        haptics.success();
        signalReviewPromptOpportunity();
      } catch (error) {
        console.error('Error completing task:', error);
        haptics.error();
        onCompleteFailed?.(item);
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
        return colors.error;
      case 'medium':
        return colors.statusStuck;
      case 'low':
        return colors.textMuted;
      default:
        return colors.textMuted;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
      onDismiss={notifyDismissed}
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
              },
            ]}
          >
            <View style={styles.handleWrap}>
              <View style={styles.handle} />
            </View>

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
                hitSlop={touch.hitSlop}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </PressableWithFade>
            </View>

            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={false}
            >
              {isTask && (
                <>
                  <Text style={styles.title}>{item.text || item.title}</Text>
                  {item.description && (
                    <Text style={styles.description}>{item.description}</Text>
                  )}
                  {item.due_date && (
                    <View style={styles.detailRow}>
                      <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
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
                      <Ionicons name="folder-outline" size={20} color={colors.textMuted} />
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
                      <Ionicons name="time-outline" size={20} color={colors.primary} />
                      <Text style={styles.detailText}>
                        {formatTime(item.start_time)}
                        {item.end_time && ` - ${formatTime(item.end_time)}`}
                      </Text>
                    </View>
                  )}
                  {item.start_time && (
                    <View style={styles.detailRow}>
                      <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
                      <Text style={styles.detailText}>{formatDate(item.start_time)}</Text>
                    </View>
                  )}
                  {item.location && (
                    <View style={styles.detailRow}>
                      <Ionicons name="location-outline" size={20} color={colors.textMuted} />
                      <Text style={styles.detailText}>{item.location}</Text>
                    </View>
                  )}
                  {item.category && (
                    <View style={styles.detailRow}>
                      <Ionicons name="pricetag-outline" size={20} color={colors.textMuted} />
                      <Text style={styles.detailText}>Category: {item.category}</Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            {isTask && !item.completed && (
              <View style={[styles.actions, { paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm) }]}>
                {item.project_id && onAddPhoto ? (
                  <PressableWithFade
                    style={[styles.photoButton, photoUploading && styles.photoButtonDisabled]}
                    onPress={() => onAddPhoto(item)}
                    disabled={photoUploading}
                    hapticType="light"
                    testID="my-day-modal-add-photo"
                  >
                    <Ionicons name="camera-outline" size={20} color={colors.primary} />
                    <Text style={styles.photoButtonText}>{t('mobile.add_photo')}</Text>
                  </PressableWithFade>
                ) : null}
                <PressableWithFade
                  style={styles.completeButton}
                  onPress={handleCompleteTask}
                  hapticType="medium"
                >
                  <Ionicons name="checkmark-circle" size={20} color={colors.white} />
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
  modalWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    maxHeight: '80%',
    minHeight: '40%',
  },
  handleWrap: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    minWidth: touch.minSize,
    minHeight: touch.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 0,
  },
  contentContainer: {
    padding: spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.md,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  detailText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  actions: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: radius.button,
    gap: spacing.sm,
    minHeight: touch.minSize,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  photoButtonDisabled: {
    opacity: 0.5,
  },
  photoButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  completeButton: {
    backgroundColor: colors.statusDone,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: radius.button,
    gap: spacing.sm,
    minHeight: touch.minSize,
  },
  completeButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
