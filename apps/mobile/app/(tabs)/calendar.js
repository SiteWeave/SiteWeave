import { View, Text, StyleSheet } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useAuth } from '../../context/AuthContext';
import { fetchCalendarEvents, fetchUserIncompleteTasks, getCalendarLoadRange, isDateInCalendarLoadRange } from '@siteweave/core-logic';
import { filterByOrganizationId } from '../../utils/orgScope';
import DatePickerStrip from '../../components/DatePickerStrip';
import PressableWithFade from '../../components/PressableWithFade';
import EventSheet from '../../components/EventSheet';
import Button from '../../components/ui/Button';
import { useMobileExperience } from '../../context/MobileExperienceContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHaptics } from '../../hooks/useHaptics';
import AppHeader from '../../components/ui/AppHeader';
import { scrollBottomPadding, contentTopInset } from '../../utils/layoutInsets';
import { colors, spacing, touch, shadows } from '../../theme';
import { SkeletonList } from '../../components/ui/Skeleton';
import { warmProjectDetailCache } from '../../utils/prefetchIntent';

export default function CalendarScreen() {
  const { t } = useTranslation();
  const { supabase, user, activeOrganization } = useAuth();
  const { isManagerView } = useMobileExperience();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dayItems, setDayItems] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [calendarTasks, setCalendarTasks] = useState([]);
  const [itemsByDate, setItemsByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const realtimeRef = useRef(null);
  const realtimeReloadTimerRef = useRef(null);
  const loadCalendarDataRef = useRef(async () => {});
  const loadGenerationRef = useRef(0);
  const loadedRangeRef = useRef(null);

  useEffect(() => {
    loadCalendarData();
  }, [user?.id, activeOrganization?.id]);

  useEffect(() => {
    const range = loadedRangeRef.current;
    if (!range) return;
    if (!isDateInCalendarLoadRange(selectedDate, range)) {
      loadCalendarData({ silent: true });
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
        scheduleRealtimeReload();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        scheduleRealtimeReload();
      })
      .subscribe();
    realtimeRef.current = channel;

    function scheduleRealtimeReload() {
      if (realtimeReloadTimerRef.current) clearTimeout(realtimeReloadTimerRef.current);
      realtimeReloadTimerRef.current = setTimeout(() => {
        realtimeReloadTimerRef.current = null;
        void loadCalendarDataRef.current?.({ silent: true });
      }, 400);
    }

    return () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
        realtimeReloadTimerRef.current = null;
      }
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

  const loadCalendarData = async ({ silent = false } = {}) => {
    if (!supabase) return;
    const generation = ++loadGenerationRef.current;
    try {
      if (!silent) setLoading(true);
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
      if (generation !== loadGenerationRef.current) return;

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
      if (!silent && generation === loadGenerationRef.current) setLoading(false);
    }
  };
  loadCalendarDataRef.current = loadCalendarData;

  const handleEventCreated = () => {
    loadCalendarData({ silent: true });
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
          style={[styles.eventCard, isTask && styles.taskCardCompact]}
          onPress={handlePress}
          onPressIn={() => {
            if (item.project_id && user?.id && supabase) {
              warmProjectDetailCache({
                supabase,
                userId: user.id,
                projectId: item.project_id,
              }).catch(() => {});
            }
          }}
          static
          accessibilityRole="button"
          accessibilityLabel={item.title}
        >
          {isTask ? (
            <View style={styles.taskLineRow}>
              <Ionicons name="checkbox-outline" size={18} color={eventColor} />
              <Text style={styles.taskLineTitle} numberOfLines={1}>
                {item.title}
              </Text>
              {item.percent_complete != null ? (
                <Text style={[styles.taskLinePercent, { color: eventColor }]}>
                  {Math.round(Number(item.percent_complete) || 0)}%
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.eventContent}>
              <View style={styles.eventHeader}>
                <>
                  {item.category ? (
                    <View style={[styles.categoryDot, { backgroundColor: eventColor }]} />
                  ) : null}
                  <Text style={styles.eventTime}>{formatTime(item.start_time)}</Text>
                  {item.end_time && (
                    <Text style={styles.eventTimeEnd}> - {formatTime(item.end_time)}</Text>
                  )}
                </>
              </View>
              <Text style={styles.eventTitle}>{item.title}</Text>
              {item.location && (
                <View style={styles.eventDetail}>
                  <Ionicons name="location-outline" size={16} color="#4B5563" />
                  <Text style={styles.eventDetailText}>{item.location}</Text>
                </View>
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
                    router.push(`/(tabs)/projects/${item.project_id}`);
                  }}
                >
                  <Ionicons name="checkmark-done-outline" size={16} color="#1D4ED8" />
                  <Text style={styles.eventActionText}>
                    {t('mobile.open_project_tasks')}
                  </Text>
                </PressableWithFade>
              )}
            </View>
          )}
        </PressableWithFade>
      </View>
    );
  };

  const dateStr = selectedDate.toISOString().split('T')[0];
  const eventCount = (itemsByDate[dateStr] || []).filter((i) => i.itemType === 'event').length;
  const taskCount = (itemsByDate[dateStr] || []).filter((i) => i.itemType === 'task').length;

  return (
    <View style={[styles.safeArea, { paddingTop: contentTopInset(insets, spacing.sm) }]}>
      <View style={styles.container}>
        <AppHeader title={t('mobile.calendar_title', { defaultValue: 'Calendar' })} dense />

        <FlashList
          style={styles.list}
          data={dayItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderDayItem}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.timelineContent,
            { paddingBottom: scrollBottomPadding(insets, spacing.lg) },
            dayItems.length === 0 && styles.timelineContentEmpty,
          ]}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <DatePickerStrip
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
                eventsByDate={itemsByDate}
                style={styles.dateStrip}
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
            </View>
          }
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
                <Button
                  label={t('mobile.calendar_add_event')}
                  onPress={handleOpenCreate}
                  style={styles.emptyButton}
                  testID="calendar-empty-add-event"
                />
              </View>
            )
          }
        />
      </View>

      <EventSheet
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
  list: {
    flex: 1,
  },
  listHeader: {
    marginHorizontal: -spacing.lg,
  },
  dateStrip: {
    marginTop: spacing.sm,
  },
  timelineContent: {
    flexGrow: 1,
  },
  timelineContentEmpty: {
    flexGrow: 1,
  },
  daySummary: {
    marginHorizontal: spacing.lg,
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
  taskCardCompact: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    justifyContent: 'center',
  },
  taskLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  taskLineTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  taskLinePercent: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 0,
    fontVariant: 'tabular-nums',
  },
  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginBottom: spacing.md,
    minHeight: touch.minRowHeight,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  eventContent: {
    flex: 1,
    padding: 16,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
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
  emptyButton: {
    marginTop: spacing.xl,
    minWidth: 200,
  },
  emptyHint: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.md,
    textAlign: 'center',
    lineHeight: 20,
  },
});
