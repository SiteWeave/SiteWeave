import { View, Text, StyleSheet, FlatList, ScrollView } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { fetchEventsByDate, fetchCalendarEvents } from '@siteweave/core-logic';
import DatePickerStrip from '../../components/DatePickerStrip';
import PressableWithFade from '../../components/PressableWithFade';
import EventModal from '../../components/EventModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHaptics } from '../../hooks/useHaptics';

export default function CalendarScreen() {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [eventsByDate, setEventsByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const realtimeRef = useRef(null);

  useEffect(() => {
    loadAllEvents();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    if (realtimeRef.current) {
      supabase.removeChannel(realtimeRef.current);
      realtimeRef.current = null;
    }

    const channel = supabase
      .channel('calendar_events_mobile')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => {
        loadAllEvents();
      })
      .subscribe();
    realtimeRef.current = channel;

    return () => {
      if (realtimeRef.current) {
        supabase.removeChannel(realtimeRef.current);
        realtimeRef.current = null;
      }
    };
  }, [supabase]);

  useEffect(() => {
    if (selectedDate) {
      loadEventsForDate();
    }
  }, [selectedDate, allEvents]);

  const loadAllEvents = async () => {
    try {
      setLoading(true);
      const data = await fetchCalendarEvents(supabase);
      setAllEvents(data || []);

      // Group events by date
      const grouped = {};
      (data || []).forEach(event => {
        const dateStr = new Date(event.start_time).toISOString().split('T')[0];
        if (!grouped[dateStr]) {
          grouped[dateStr] = [];
        }
        grouped[dateStr].push(event);
      });
      setEventsByDate(grouped);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEventCreated = () => {
    loadAllEvents();
  };

  const handleOpenCreate = () => {
    setEditingEvent(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (event) => {
    setEditingEvent(event);
    setShowAddModal(true);
  };

  const loadEventsForDate = async () => {
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const dayEvents = eventsByDate[dateStr] || [];
      setEvents(dayEvents);
    } catch (error) {
      console.error('Error loading events for date:', error);
    }
  };

  const getEventColor = (event) => {
    // Use category or default color
    if (event.color) return event.color;
    if (event.category === 'meeting') return '#3B82F6';
    if (event.category === 'progress-review') return '#EF4444';
    if (event.category === 'site-visit') return '#10B981';
    return '#6B7280';
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

  const getTimeGap = (prevEvent, currentEvent) => {
    if (!prevEvent || !currentEvent) return null;
    const prevEnd = new Date(prevEvent.end_time || prevEvent.start_time);
    const currentStart = new Date(currentEvent.start_time);
    const gapMinutes = (currentStart - prevEnd) / (1000 * 60);
    return gapMinutes > 0 ? gapMinutes : null;
  };

  const renderEvent = ({ item, index }) => {
    const prevEvent = index > 0 ? events[index - 1] : null;
    const gapMinutes = getTimeGap(prevEvent, item);
    const eventColor = getEventColor(item);

    return (
      <View>
        {gapMinutes && gapMinutes > 15 && (
          <View style={styles.gapContainer}>
            <View style={styles.gapLine} />
            <Text style={styles.gapText}>
              {Math.floor(gapMinutes / 60)}h {gapMinutes % 60}m free
            </Text>
            <View style={styles.gapLine} />
          </View>
        )}
        <PressableWithFade style={styles.eventCard} onPress={() => handleOpenEdit(item)} activeOpacity={0.85}>
          <View style={[styles.eventColorBar, { backgroundColor: eventColor }]} />
          <View style={styles.eventContent}>
            <View style={styles.eventHeader}>
              <Text style={styles.eventTime}>{formatTime(item.start_time)}</Text>
              {item.end_time && (
                <Text style={styles.eventTimeEnd}> - {formatTime(item.end_time)}</Text>
              )}
            </View>
            <Text style={styles.eventTitle}>{item.title}</Text>
            {item.location && (
              <View style={styles.eventDetail}>
                <Ionicons name="location-outline" size={16} color="#4B5563" />
                <Text style={styles.eventDetailText}>{item.location}</Text>
              </View>
            )}
            {item.description && (
              <Text style={styles.eventDescription} numberOfLines={2}>
                {item.description}
              </Text>
            )}
            {item.category && (
              <View style={styles.eventCategory}>
                <Text style={[styles.eventCategoryText, { color: eventColor }]}>
                  {item.category}
                </Text>
              </View>
            )}
            {item.project_id && (
              <PressableWithFade
                style={styles.eventActionButton}
                onPress={() => {
                  haptics.light();
                  router.push(`/projects/${item.project_id}`);
                }}
              >
                <Ionicons name="checkmark-done-outline" size={16} color="#1D4ED8" />
                <Text style={styles.eventActionText}>{t('mobile.open_project_tasks')}</Text>
              </PressableWithFade>
            )}
          </View>
        </PressableWithFade>
      </View>
    );
  };

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.container}>
        {/* Date Picker Strip */}
        <DatePickerStrip
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
          eventsByDate={eventsByDate}
        />

        {/* Timeline */}
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={renderEvent}
          contentContainerStyle={styles.timelineContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={48} color="#9CA3AF" />
              <Text style={styles.emptyText}>{t('mobile.no_events_day')}</Text>
            </View>
          }
        />
      </View>

      {/* FAB */}
      <PressableWithFade
        style={styles.fab}
        onPress={() => {
          haptics.medium();
          handleOpenCreate();
        }}
        activeOpacity={0.8}
        hapticType="medium"
      >
        <Ionicons name="add" size={28} color="#fff" />
      </PressableWithFade>

      {/* Event Creation Modal */}
      <EventModal
        visible={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingEvent(null);
        }}
        selectedDate={selectedDate}
        onEventCreated={handleEventCreated}
        onEventDeleted={handleEventCreated}
        eventToEdit={editingEvent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  timelineContent: {
    padding: 16,
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    minHeight: 44,
  },
  eventColorBar: {
    width: 4,
  },
  eventContent: {
    flex: 1,
    padding: 16,
  },
  eventHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  eventTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  eventTimeEnd: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  eventDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  eventDetailText: {
    fontSize: 14,
    color: '#4B5563',
  },
  eventDescription: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 8,
  },
  eventCategory: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  eventCategoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  eventActionButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  gapContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    gap: 8,
  },
  gapLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  gapText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#4B5563',
    marginTop: 16,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
});
