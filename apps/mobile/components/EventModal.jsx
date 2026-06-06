import { View, Text, StyleSheet, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform, Animated, Dimensions, Alert } from 'react-native';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { createCalendarEvent, createTask, fetchUserProjectsWithProgress } from '@siteweave/core-logic';
import PressableWithFade from './PressableWithFade';
import ModalScrim from './ui/ModalScrim';
import DateField from './ui/DateField';
import TimeField from './ui/TimeField';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHaptics } from '../hooks/useHaptics';
import { filterByOrganizationId } from '../utils/orgScope';
import { enqueueOfflineAction, processOfflineQueue } from '../utils/offlineQueue';
import {
  toLocalDateIso,
  formatLocalTime,
  parseTimeOnDate,
  ensureEndAfterStart,
  roundTimeToInterval,
} from '../utils/dateHelpers';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function EventModal({ visible, onClose, selectedDate, onEventCreated, eventToEdit = null, onEventDeleted }) {
  const { user, supabase, activeOrganization, syncPulse } = useAuth();
  const haptics = useHaptics();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [eventDate, setEventDate] = useState(null);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [category, setCategory] = useState('meeting');
  const [isAllDay, setIsAllDay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createFollowUpTask, setCreateFollowUpTask] = useState(false);
  const [projectId, setProjectId] = useState(null);
  const [projects, setProjects] = useState([]);

  const modalTranslateY = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();

  const canSave = useMemo(
    () => Boolean(title.trim() && eventDate && user && supabase),
    [title, eventDate, user, supabase],
  );

  const buildEventTimes = useCallback(() => {
    if (!eventDate) return null;
    if (isAllDay) {
      const start = parseTimeOnDate(eventDate, '00:00');
      const end = parseTimeOnDate(eventDate, '23:59');
      end.setSeconds(59, 999);
      return { startDateTime: start.toISOString(), endDateTime: end.toISOString(), dateStr: eventDate };
    }
    const adjustedEnd = ensureEndAfterStart(startTime, endTime, 60);
    const start = parseTimeOnDate(eventDate, startTime);
    const end = parseTimeOnDate(eventDate, adjustedEnd);
    return { startDateTime: start.toISOString(), endDateTime: end.toISOString(), dateStr: eventDate };
  }, [eventDate, isAllDay, startTime, endTime]);

  useEffect(() => {
    if (visible) {
      haptics.light();
      loadProjects();
      flushOfflineEvents();
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

  useEffect(() => {
    if (!visible) return;
    if (eventToEdit) {
      setTitle(eventToEdit.title || '');
      setDescription(eventToEdit.description || '');
      setLocation(eventToEdit.location || '');
      setCategory(eventToEdit.category || 'meeting');
      setIsAllDay(Boolean(eventToEdit.is_all_day));
      const start = eventToEdit.start_time ? new Date(eventToEdit.start_time) : selectedDate || new Date();
      const end = eventToEdit.end_time ? new Date(eventToEdit.end_time) : start;
      setEventDate(toLocalDateIso(start));
      setStartTime(formatLocalTime(roundTimeToInterval(start, 15)));
      setEndTime(formatLocalTime(roundTimeToInterval(end, 15)));
      setProjectId(eventToEdit.project_id || null);
    } else {
      setTitle('');
      setDescription('');
      setLocation('');
      setEventDate(toLocalDateIso(selectedDate || new Date()));
      setStartTime('09:00');
      setEndTime('10:00');
      setCategory('meeting');
      setIsAllDay(false);
      setCreateFollowUpTask(false);
    }
  }, [visible, eventToEdit, selectedDate]);

  const loadProjects = async () => {
    if (!supabase || !user) return;
    try {
      const data = await fetchUserProjectsWithProgress(supabase, user.id);
      const scoped =
        activeOrganization?.id != null
          ? filterByOrganizationId(data || [], activeOrganization.id)
          : data || [];
      setProjects(scoped);
      if (!projectId && scoped.length > 0) {
        setProjectId(scoped[0].id);
      }
    } catch (error) {
      console.error('Error loading projects for event modal:', error);
    }
  };

  const flushOfflineEvents = async () => {
    if (!supabase) return;
    await processOfflineQueue({
      create_calendar_event: async (payload) => {
        await createCalendarEvent(supabase, payload);
      },
      update_calendar_event: async (payload) => {
        const { id, ...updates } = payload;
        await supabase.from('calendar_events').update(updates).eq('id', id);
      },
      delete_calendar_event: async (payload) => {
        await supabase.from('calendar_events').delete().eq('id', payload.id);
      },
      create_task_from_event: async (payload) => {
        await createTask(supabase, payload);
      },
    });
  };

  useEffect(() => {
    flushOfflineEvents();
  }, [syncPulse]);

  const categories = [
    { value: 'meeting', label: 'Meeting', color: '#3B82F6' },
    { value: 'site-visit', label: 'Site Visit', color: '#10B981' },
    { value: 'progress-review', label: 'Progress Review', color: '#EF4444' },
    { value: 'other', label: 'Other', color: '#6B7280' },
  ];

  const handleStartTimeChange = (nextStart) => {
    setStartTime(nextStart);
    setEndTime((prev) => ensureEndAfterStart(nextStart, prev, 60));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Title required', 'Please enter an event title.');
      return;
    }
    if (!eventDate) {
      Alert.alert('Date required', 'Please select an event date.');
      return;
    }
    if (!user || !supabase) return;

    const times = buildEventTimes();
    if (!times) return;

    try {
      haptics.medium();
      setLoading(true);

      const eventData = {
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        start_time: times.startDateTime,
        end_time: times.endDateTime,
        category,
        is_all_day: isAllDay,
        user_id: user.id,
        organization_id: activeOrganization?.id || null,
      };

      if (eventToEdit?.id) {
        const { error: updateError } = await supabase
          .from('calendar_events')
          .update(eventData)
          .eq('id', eventToEdit.id);
        if (updateError) throw updateError;
      } else {
        await createCalendarEvent(supabase, eventData);
      }

      if (createFollowUpTask && projectId) {
        await createTask(supabase, {
          text: `Event follow-up: ${title.trim()}`,
          description: description.trim() || null,
          project_id: projectId,
          organization_id: activeOrganization?.id || null,
          due_date: times.dateStr,
          priority: 'Medium',
          completed: false,
          created_by_user_id: user.id,
        });
      }

      setTitle('');
      setDescription('');
      setLocation('');
      setEventDate(toLocalDateIso(selectedDate || new Date()));
      setStartTime('09:00');
      setEndTime('10:00');
      setCategory('meeting');
      setIsAllDay(false);
      setCreateFollowUpTask(false);

      haptics.success();
      onEventCreated?.();
      onClose();
    } catch (error) {
      console.error('Error creating event:', error);
      haptics.error();
      const offlinePayload = {
        ...(eventToEdit?.id ? { id: eventToEdit.id } : {}),
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        start_time: times.startDateTime,
        end_time: times.endDateTime,
        category,
        is_all_day: isAllDay,
        user_id: user.id,
        organization_id: activeOrganization?.id || null,
      };
      await enqueueOfflineAction({
        type: eventToEdit?.id ? 'update_calendar_event' : 'create_calendar_event',
        payload: offlinePayload,
      });
      if (createFollowUpTask && projectId) {
        await enqueueOfflineAction({
          type: 'create_task_from_event',
          payload: {
            text: `Event follow-up: ${title.trim()}`,
            description: description.trim() || null,
            project_id: projectId,
            organization_id: activeOrganization?.id || null,
            due_date: times.dateStr,
            priority: 'Medium',
            completed: false,
            created_by_user_id: user.id,
          },
        });
      }
      alert('No connection. Event was queued for sync.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      haptics.light();
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!eventToEdit?.id || loading) return;
    Alert.alert('Delete event', 'Are you sure you want to delete this event?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            const { error } = await supabase.from('calendar_events').delete().eq('id', eventToEdit.id);
            if (error) throw error;
            onEventDeleted?.();
            onClose();
          } catch (error) {
            console.error('Error deleting event:', error);
            await enqueueOfflineAction({
              type: 'delete_calendar_event',
              payload: { id: eventToEdit.id },
            });
            alert('No connection. Delete queued for sync.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalContainer}>
        <ModalScrim onPress={handleClose} opacity={0.5} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <Animated.View
            style={[
              styles.modalContentWrapper,
              {
                transform: [{
                  translateY: modalTranslateY.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, SCREEN_HEIGHT],
                  }),
                }],
              },
            ]}
          >
            <View style={[styles.modalContent, { paddingTop: insets.top }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{eventToEdit ? 'Edit Event' : 'New Event'}</Text>
                <PressableWithFade
                  style={styles.closeButton}
                  onPress={handleClose}
                  disabled={loading}
                  hapticType="light"
                >
                  <Ionicons name="close" size={24} color="#111827" />
                </PressableWithFade>
              </View>

              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Title *</Text>
                  <TextInput
                    style={styles.input}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Event title"
                    placeholderTextColor="#9CA3AF"
                    editable={!loading}
                  />
                </View>

                <View style={styles.formGroup}>
                  <DateField
                    label="Date *"
                    value={eventDate}
                    onChange={setEventDate}
                    placeholder="Select date"
                    disabled={loading}
                    testID="event-date"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Description</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Add description"
                    placeholderTextColor="#9CA3AF"
                    multiline={true}
                    numberOfLines={4}
                    editable={!loading}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Location</Text>
                  <TextInput
                    style={styles.input}
                    value={location}
                    onChangeText={setLocation}
                    placeholder="Event location"
                    placeholderTextColor="#9CA3AF"
                    editable={!loading}
                  />
                </View>

                <View style={styles.formGroup}>
                  <PressableWithFade
                    style={styles.checkboxRow}
                    onPress={() => {
                      if (!loading) {
                        haptics.selection();
                        setIsAllDay(!isAllDay);
                      }
                    }}
                    disabled={loading}
                    hapticType="selection"
                  >
                    <Ionicons
                      name={isAllDay ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={isAllDay ? '#3B82F6' : '#4B5563'}
                    />
                    <Text style={styles.checkboxLabel}>All day event</Text>
                  </PressableWithFade>
                </View>

                {!isAllDay && (
                  <View style={styles.timeRow}>
                    <View style={styles.timeCol}>
                      <TimeField
                        label="Start"
                        value={startTime}
                        onChange={handleStartTimeChange}
                        dateIso={eventDate}
                        disabled={loading || !eventDate}
                        testID="event-start-time"
                      />
                    </View>
                    <View style={styles.timeCol}>
                      <TimeField
                        label="End"
                        value={endTime}
                        onChange={setEndTime}
                        dateIso={eventDate}
                        disabled={loading || !eventDate}
                        testID="event-end-time"
                      />
                    </View>
                  </View>
                )}

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Category</Text>
                  <View style={styles.categoryContainer}>
                    {categories.map((cat) => (
                      <PressableWithFade
                        key={cat.value}
                        style={[
                          styles.categoryChip,
                          category === cat.value && styles.categoryChipActive,
                          { borderColor: cat.color },
                        ]}
                        onPress={() => {
                          if (!loading) {
                            haptics.selection();
                            setCategory(cat.value);
                          }
                        }}
                        disabled={loading}
                        hapticType="selection"
                      >
                        <Text
                          style={[
                            styles.categoryChipText,
                            category === cat.value && { color: cat.color },
                          ]}
                        >
                          {cat.label}
                        </Text>
                      </PressableWithFade>
                    ))}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <PressableWithFade
                    style={styles.checkboxRow}
                    onPress={() => setCreateFollowUpTask((value) => !value)}
                    disabled={loading}
                  >
                    <Ionicons
                      name={createFollowUpTask ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={createFollowUpTask ? '#3B82F6' : '#4B5563'}
                    />
                    <Text style={styles.checkboxLabel}>Create task from this event</Text>
                  </PressableWithFade>
                </View>

                {createFollowUpTask && (
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Project</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.categoryContainer}>
                        {projects.map((project) => (
                          <PressableWithFade
                            key={project.id}
                            style={[
                              styles.categoryChip,
                              projectId === project.id && styles.categoryChipActive,
                              { borderColor: projectId === project.id ? '#3B82F6' : '#E5E7EB' },
                            ]}
                            onPress={() => setProjectId(project.id)}
                            disabled={loading}
                          >
                            <Text style={styles.categoryChipText}>{project.name}</Text>
                          </PressableWithFade>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}
              </ScrollView>

              <View style={styles.modalFooter}>
                {!canSave && !loading ? (
                  <Text style={styles.saveHint}>Enter a title and date to save</Text>
                ) : null}
                {eventToEdit ? (
                  <PressableWithFade
                    style={[styles.button, styles.deleteButton]}
                    onPress={handleDelete}
                    disabled={loading}
                    hapticType="light"
                  >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </PressableWithFade>
                ) : null}
                <PressableWithFade
                  testID="modal-cancel"
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleClose}
                  disabled={loading}
                  hapticType="light"
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </PressableWithFade>
                <PressableWithFade
                  testID="modal-save"
                  style={[
                    styles.button,
                    styles.saveButton,
                    (!canSave || loading) && styles.saveButtonDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={!canSave || loading}
                  hapticType="medium"
                >
                  <Text style={styles.saveButtonText}>
                    {loading ? 'Saving...' : eventToEdit ? 'Update' : 'Save'}
                  </Text>
                </PressableWithFade>
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    position: 'relative',
  },
  modalOverlay: {
    flex: 1,
  },
  modalContentWrapper: {
    flex: 1,
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexGrow: 1,
  },
  formGroup: {
    marginTop: 20,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingHorizontal: 0,
  },
  timeCol: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff',
    minHeight: 44,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#111827',
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    minHeight: 44,
    justifyContent: 'center',
  },
  categoryChipActive: {
    backgroundColor: '#fff',
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  modalFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
    justifyContent: 'flex-end',
  },
  saveHint: {
    flexBasis: '100%',
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
    flex: 0,
    paddingHorizontal: 20,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    flex: 0,
    paddingHorizontal: 18,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#B91C1C',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    flex: 0,
    paddingHorizontal: 25,
    minWidth: 110,
  },
  saveButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
