import { View, Text, StyleSheet, FlatList, ScrollView } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { fetchCalendarEvents, fetchUserIncompleteTasks, getCalendarLoadRange, isDateInCalendarLoadRange } from '@siteweave/core-logic';
import { filterByOrganizationId } from '../../utils/orgScope';
import DatePickerStrip from '../../components/DatePickerStrip';
import PressableWithFade from '../../components/PressableWithFade';
import EventModal from '../../components/EventModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHaptics } from '../../hooks/useHaptics';
import AppHeader from '../../components/ui/AppHeader';
import { TAB_BAR_CLEARANCE, scrollBottomPadding } from '../../components/ui/FloatingTabBar';
import { colors, spacing, touch, shadows } from '../../theme';
import { useBranding } from '../../context/BrandingContext';
import { SkeletonList } from '../../components/ui/Skeleton';

export default function CalendarScreen() {
  const { t } = useTranslation();
  const { supabase, user, activeOrganization } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const { primaryColor } = useBranding();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dayItems, setDayItems] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [calendarTasks, setCalendarTasks] = useState([]);
  const [itemsByDate, setItemsByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const realtimeRef = useRef(null);
  const loadedRangeRef = useRef(null);

  useEffect(() => {
    loadCalendarData();
  }, [user?.id, activeOrganization?.id]);

  useEffect(() => {
    const range = loadedRangeRef.current;
    if (!range) return;
    if (!isDateInCalendarLoadRange(selectedDate, range)) {
      loadCalendarData();
    }
  }, [selectedDate.getFullYear(), selectedDate.getMonth()]);

  useEffect(() => {
    if (!supabase) return;
    if (realtimeRef.current) {
      supabase.removeChannel(realtimeRef.current);
      realtimeRef.current = null;
    }

    const channel = supabase
      .channel('calendar_events_mobile')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => {
        loadCalendarData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        loadCalendarData();
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

  const taskToCalendarItem = (task) => ({
    id: `task-${task.id}`,
    itemType: 'task',
    title: task.text || t('mobile.untitled_task'),
    start_time: `${task.due_date}T08:00:00`,
    end_time: null,
    due_date: task.due_date,
    project_id: task.project_id,
    priority: task.priority,
    percent_complete: task.percent_complete,
    completed: task.completed,
    taskId: task.id,
  });

  const loadCalendarData = async () => {
    if (!supabase) return;
    try {
      setLoading(true);
      const rangeRef = selectedDate || new Date();
      const [eventsData, tasksData] = await Promise.allSettled([
        fetchCalendarEvents(supabase, rangeRef),
        user?.id ? fetchUserIncompleteTasks(supabase, user.id) : Promise.resolve([]),
      ]);

      const events = eventsData.status === 'fulfilled' ? (eventsData.value || []) : [];
      const tasksRawAll = tasksData.status === 'fulfilled' ? (tasksData.value || []) : [];
      const orgId = activeOrganization?.id;
      const tasksRaw = orgId ? filterByOrganizationId(tasksRawAll, orgId) : tasksRawAll;
      const tasks = (tasksRaw || []).filter((task) => task.due_date);

      setAllEvents(events);
      setCalendarTasks(tasks);
      loadedRangeRef.current = getCalendarLoadRange(rangeRef);

      const grouped = {};
      const addToDate = (dateStr, item) => {
        if (!dateStr) return;
        if (!grouped[dateStr]) grouped[dateStr] = [];
        grouped[dateStr].push(item);
      };

      events.forEach((event) => {
        const dateStr = new Date(event.start_time).toISOString().split('T')[0];
        addToDate(dateStr, { ...event, itemType: 'event' });
      });
      tasks.forEach((task) => {
        addToDate(task.due_date, taskToCalendarItem(task));
      });

      setItemsByDate(grouped);
    } catch (error) {
      console.error('Error loading calendar:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEventCreated = () => {
    loadCalendarData();
  };

  const handleOpenCreate = () => {
    setEditingEvent(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (event) => {
    if (event?.itemType === 'task') return;
    setEditingEvent(event);
    setShowAddModal(true);
  };

  const loadItemsForDate = () => {
    const dateStr = selectedDate.toISOString().split('T')[0];
    const items = (itemsByDate[dateStr] || []).slice().sort((a, b) => {
      const aTime = new Date(a.start_time || `${dateStr}T00:00:00`).getTime();
      const bTime = new Date(b.start_time || `${dateStr}T00:00:00`).getTime();
      if (a.itemType === 'task' && b.itemType !== 'task') return -1;
      if (b.itemType === 'task' && a.itemType !== 'task') return 1;
      return aTime - bTime;
    });
    setDayItems(items);
  };

  useEffect(() => {
    if (selectedDate) loadItemsForDate();
  }, [selectedDate, itemsByDate]);

  const getEventColor = (event) => {
    if (event.itemType === 'task') {
      switch (event.priority?.toLowerCase()) {
        case 'high':
          return '#EF4444';
        case 'low':
          return '#6B7280';
        default:
          return '#F59E0B';
      }
    }
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

  const renderDayItem = ({ item, index }) => {
    const prevItem = index > 0 ? dayItems[index - 1] : null;
    const gapMinutes = item.itemType === 'event' ? getTimeGap(prevItem, item) : null;
    const eventColor = getEventColor(item);
    const isTask = item.itemType === 'task';

    const handlePress = () => {
      if (isTask && item.project_id) {
        haptics.light();
        router.push(`/(tabs)/projects/${item.project_id}`);
        return;
      }
      handleOpenEdit(item);
    };

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
        <PressableWithFade
          style={styles.eventCard}
          onPress={handlePress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={item.title}
        >
          <View style={[styles.eventColorBar, { backgroundColor: eventColor }]} />
          <View style={styles.eventContent}>
            <View style={styles.eventHeader}>
              {isTask ? (
                <View style={styles.taskBadge}>
                  <Ionicons name="checkbox-outline" size={14} color={eventColor} />
                  <Text style={[styles.taskBadgeText, { color: eventColor }]}>
                    {t('mobile.calendar_task_badge', { defaultValue: 'Task due' })}
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.eventTime}>{formatTime(item.start_time)}</Text>
                  {item.end_time && (
                    <Text style={styles.eventTimeEnd}> - {formatTime(item.end_time)}</Text>
                  )}
                </>
              )}
            </View>
            <Text style={styles.eventTitle}>{item.title}</Text>
            {isTask && item.percent_complete != null ? (
              <Text style={styles.eventDescription}>
                {t('mobile.percent_complete', { percent: Math.round(Number(item.percent_complete) || 0) })}
              </Text>
            ) : null}
            {!isTask && item.location && (
              <View style={styles.eventDetail}>
                <Ionicons name="location-outline" size={16} color="#4B5563" />
                <Text style={styles.eventDetailText}>{item.location}</Text>
              </View>
            )}
            {!isTask && item.description && (
              <Text style={styles.eventDescription} numberOfLines={2}>
                {item.description}
              </Text>
            )}
            {!isTask && item.category && (
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
                  router.push(`/(tabs)/projects/${item.project_id}`);
                }}
              >
                <Ionicons name={isTask ? 'arrow-forward-outline' : 'checkmark-done-outline'} size={16} color="#1D4ED8" />
                <Text style={styles.eventActionText}>
                  {isTask ? t('mobile.open_task_project', { defaultValue: 'Open project' }) : t('mobile.open_project_tasks')}
                </Text>
              </PressableWithFade>
            )}
          </View>
        </PressableWithFade>
      </View>
    );
  };

  const dateStr = selectedDate.toISOString().split('T')[0];
  const eventCount = (itemsByDate[dateStr] || []).filter((i) => i.itemType === 'event').length;
  const taskCount = (itemsByDate[dateStr] || []).filter((i) => i.itemType === 'task').length;

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.container}>
        <AppHeader title={t('mobile.calendar_title', { defaultValue: 'Calendar' })} />
        <DatePickerStrip
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
          eventsByDate={itemsByDate}
        />

        {(eventCount > 0 || taskCount > 0) && (
          <View style={styles.daySummary}>
            <Text style={styles.daySummaryText}>
              {t('mobile.calendar_day_summary', {
                defaultValue: '{{events}} events · {{tasks}} tasks due',
                events: eventCount,
                tasks: taskCount,
              })}
            </Text>
          </View>
        )}

        <FlatList
          data={dayItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderDayItem}
          contentContainerStyle={[
            styles.timelineContent,
            { paddingBottom: scrollBottomPadding(insets, spacing.lg) },
            dayItems.length === 0 && styles.timelineContentEmpty,
          ]}
          ListEmptyComponent={
            loading ? (
              <View style={styles.skeletonWrap}>
                <SkeletonList count={5} rowHeight={72} />
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>
                  {t('mobile.calendar_empty_title', { defaultValue: 'Nothing scheduled' })}
                </Text>
                <Text style={styles.emptyText}>{t('mobile.no_events_day')}</Text>
                <Text style={styles.emptyHint}>
                  {t('mobile.calendar_empty_hint', {
                    defaultValue: 'Add an event or set task due dates to see them here.',
                  })}
                </Text>
              </View>
            )
          }
        />
      </View>

      {/* FAB */}
      <PressableWithFade
        style={[styles.fab, { backgroundColor: primaryColor, bottom: TAB_BAR_CLEARANCE + spacing.md }]}
        onPress={() => {
          haptics.medium();
          handleOpenCreate();
        }}
        activeOpacity={0.8}
        hapticType="medium"
        accessibilityRole="button"
        accessibilityLabel="Add event"
        testID="calendar-add-event"
      >
        <Ionicons name="add" size={28} color={colors.white} />
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
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  timelineContent: {
    flexGrow: 1,
  },
  timelineContentEmpty: {
    flexGrow: 1,
  },
  daySummary: {
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  daySummaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  taskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  taskBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginBottom: spacing.md,
    overflow: 'hidden',
    minHeight: touch.minRowHeight,
    ...shadows.card,
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
    minHeight: touch.minSize,
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
  skeletonWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.md,
    textAlign: 'center',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: touch.fabSize,
    height: touch.fabSize,
    borderRadius: touch.fabSize / 2,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
});
