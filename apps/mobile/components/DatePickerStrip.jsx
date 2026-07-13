import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import PressableWithFade from './PressableWithFade';
import { Text } from './ui/Text';
import { useHaptics } from '../hooks/useHaptics';
import { colors, spacing, touch } from '../theme';

function isSameDay(date1, date2) {
  if (!date1 || !date2) return false;
  return date1.toISOString().split('T')[0] === date2.toISOString().split('T')[0];
}

function addMonths(date, delta) {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + delta);
  if (next.getDate() !== day) {
    next.setDate(0);
  }
  return next;
}

function addWeeks(date, delta) {
  const next = new Date(date);
  next.setDate(next.getDate() + delta * 7);
  return next;
}

export default function DatePickerStrip({ selectedDate, onDateSelect, eventsByDate = {}, style }) {
  const { t, i18n } = useTranslation();
  const haptics = useHaptics();
  const { width: windowWidth } = useWindowDimensions();
  const [showMonthView, setShowMonthView] = useState(false);
  const locale = i18n.language || 'en';
  const anchorDate = selectedDate || new Date();
  const today = useMemo(() => new Date(), []);
  const isTodaySelected = isSameDay(anchorDate, today);

  const layout = useMemo(() => {
    const stripPad = spacing.lg * 2;
    const contentWidth = windowWidth - stripPad;
    const cellWidth = contentWidth / 7;
    const monthCellHeight = Math.max(56, Math.round(cellWidth * 0.82));
    const weekCellHeight = Math.max(92, monthCellHeight + 20);
    return { cellWidth, monthCellHeight, weekCellHeight };
  }, [windowWidth]);

  const weekDates = useMemo(() => {
    const dates = [];
    const startOfWeek = new Date(anchorDate);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day);

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  }, [anchorDate]);

  const monthDates = useMemo(() => {
    const dates = [];
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    for (let i = 0; i < 35; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      dates.push(date);
    }
    return dates;
  }, [anchorDate]);

  const monthWeeks = useMemo(() => {
    const weeks = [];
    for (let i = 0; i < monthDates.length; i += 7) {
      weeks.push(monthDates.slice(i, i + 7));
    }
    return weeks;
  }, [monthDates]);

  const weekDayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        new Date(2024, 0, 7 + index).toLocaleDateString(locale, { weekday: 'short' }),
      ),
    [locale],
  );

  const hasEvents = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return eventsByDate[dateStr] && eventsByDate[dateStr].length > 0;
  };

  const shiftPeriod = (delta) => {
    haptics.selection();
    const nextDate = showMonthView
      ? addMonths(anchorDate, delta)
      : addWeeks(anchorDate, delta);
    onDateSelect(nextDate);
  };

  const jumpToToday = () => {
    haptics.selection();
    onDateSelect(new Date());
  };

  const renderWeekView = () => (
    <View style={[styles.weekRowStrip, { minHeight: layout.weekCellHeight }]}>
      {weekDates.map((date, index) => {
        const isSelected = isSameDay(date, anchorDate);
        const dayName = date.toLocaleDateString(locale, { weekday: 'short' });
        const dayNumber = date.getDate();
        const isToday = isSameDay(date, today);

        return (
          <View key={index} style={[styles.weekCell, { minHeight: layout.weekCellHeight }]}>
            <PressableWithFade
              containerStyle={styles.fillPressable}
              style={[
                styles.dayButton,
                { minHeight: layout.weekCellHeight },
                isSelected && styles.dayButtonSelected,
                isToday && !isSelected && styles.dayButtonToday,
              ]}
              static
              onPress={() => {
                haptics.selection();
                onDateSelect(date);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>
                {dayName}
              </Text>
              <View style={[styles.dayNumberContainer, isSelected && styles.dayNumberContainerSelected]}>
                <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>
                  {dayNumber}
                </Text>
              </View>
              {hasEvents(date) ? (
                <View style={[styles.eventDot, isSelected && styles.eventDotSelected]} />
              ) : null}
            </PressableWithFade>
          </View>
        );
      })}
    </View>
  );

  const renderMonthView = () => (
    <View style={styles.monthContainer}>
      <View style={styles.monthHeader}>
        {weekDayLabels.map((day, index) => (
          <View key={index} style={styles.monthDayHeader}>
            <Text style={styles.monthDayHeaderText}>{day}</Text>
          </View>
        ))}
      </View>
      <View style={styles.monthGrid}>
        {monthWeeks.map((week, weekIndex) => (
          <View
            key={`week-${weekIndex}`}
            style={[styles.weekRow, { height: layout.monthCellHeight }]}
          >
            {week.map((date, index) => {
              const isSelected = isSameDay(date, anchorDate);
              const isCurrentMonth = date.getMonth() === anchorDate.getMonth();
              const dayNumber = date.getDate();
              const isToday = isSameDay(date, today);

              return (
                <View key={`${date.toISOString()}-${index}`} style={styles.monthCell}>
                  <PressableWithFade
                    containerStyle={styles.fillPressable}
                    style={[
                      styles.monthDay,
                      isSelected && styles.monthDaySelected,
                      isToday && !isSelected && styles.monthDayToday,
                      !isCurrentMonth && styles.monthDayOtherMonth,
                    ]}
                    static
                    onPress={() => {
                      haptics.selection();
                      onDateSelect(date);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.monthDayNumber,
                        isSelected && styles.monthDayNumberSelected,
                        !isCurrentMonth && styles.monthDayNumberOtherMonth,
                      ]}
                    >
                      {dayNumber}
                    </Text>
                    {hasEvents(date) ? (
                      <View style={[styles.monthEventDot, isSelected && styles.monthEventDotSelected]} />
                    ) : null}
                  </PressableWithFade>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );

  const monthTitle = anchorDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <PressableWithFade
          style={styles.navButton}
          onPress={() => shiftPeriod(-1)}
          accessibilityRole="button"
          accessibilityLabel={
            showMonthView
              ? t('mobile.calendar_prev_month')
              : t('mobile.calendar_prev_week')
          }
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </PressableWithFade>

        <View style={styles.titleBlock}>
          <Text variant="screenTitle" style={styles.title} numberOfLines={1}>
            {monthTitle}
          </Text>
          <PressableWithFade
            style={styles.todayButton}
            onPress={jumpToToday}
            disabled={isTodaySelected}
            accessibilityRole="button"
            accessibilityLabel={t('common.today')}
            accessibilityState={{ disabled: isTodaySelected }}
          >
            <Text
              style={[
                styles.todayButtonText,
                isTodaySelected && styles.todayButtonTextActive,
              ]}
            >
              {t('common.today')}
            </Text>
          </PressableWithFade>
        </View>

        <PressableWithFade
          style={styles.navButton}
          onPress={() => shiftPeriod(1)}
          accessibilityRole="button"
          accessibilityLabel={
            showMonthView
              ? t('mobile.calendar_next_month')
              : t('mobile.calendar_next_week')
          }
        >
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </PressableWithFade>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.viewToggle}>
          <PressableWithFade
            containerStyle={styles.togglePressable}
            style={[styles.toggleSegment, !showMonthView && styles.toggleSegmentActive]}
            static
            onPress={() => {
              haptics.selection();
              setShowMonthView(false);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: !showMonthView }}
            accessibilityLabel={t('mobile.calendar_view_week')}
          >
            <Text style={[styles.toggleSegmentText, !showMonthView && styles.toggleSegmentTextActive]}>
              {t('mobile.calendar_view_week')}
            </Text>
          </PressableWithFade>
          <PressableWithFade
            containerStyle={styles.togglePressable}
            style={[styles.toggleSegment, showMonthView && styles.toggleSegmentActive]}
            static
            onPress={() => {
              haptics.selection();
              setShowMonthView(true);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: showMonthView }}
            accessibilityLabel={t('mobile.calendar_view_month')}
          >
            <Text style={[styles.toggleSegmentText, showMonthView && styles.toggleSegmentTextActive]}>
              {t('mobile.calendar_view_month')}
            </Text>
          </PressableWithFade>
        </View>
      </View>

      <View style={styles.calendarBody}>
        {showMonthView ? renderMonthView() : renderWeekView()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    minHeight: 56,
  },
  navButton: {
    width: touch.minSize,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    gap: 2,
  },
  title: {
    fontSize: 18,
    lineHeight: 22,
    textAlign: 'center',
  },
  todayButton: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  todayButtonTextActive: {
    color: colors.textMuted,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    zIndex: 1,
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: 2,
    width: '100%',
    maxWidth: 280,
    overflow: 'hidden',
  },
  togglePressable: {
    flex: 1,
  },
  toggleSegment: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  toggleSegmentActive: {
    backgroundColor: colors.surface,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleSegmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  toggleSegmentTextActive: {
    color: colors.primary,
  },
  weekRowStrip: {
    flexDirection: 'row',
    width: '100%',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  weekCell: {
    flex: 1,
  },
  fillPressable: {
    flex: 1,
    alignSelf: 'stretch',
  },
  dayButton: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: 12,
  },
  dayButtonSelected: {
    backgroundColor: colors.primary,
  },
  dayButtonToday: {
    backgroundColor: colors.primaryLight,
  },
  dayName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  dayNameSelected: {
    color: colors.white,
  },
  dayNumberContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  dayNumberContainerSelected: {
    backgroundColor: colors.white,
  },
  dayNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  dayNumberSelected: {
    color: colors.primary,
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
  },
  eventDotSelected: {
    backgroundColor: colors.white,
  },
  monthContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    width: '100%',
  },
  calendarBody: {
    marginTop: spacing.lg,
    width: '100%',
  },
  monthHeader: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: spacing.xs,
  },
  monthDayHeader: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  monthDayHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  monthGrid: {
    width: '100%',
    gap: spacing.xs,
  },
  weekRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'stretch',
  },
  monthCell: {
    flex: 1,
  },
  monthDay: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  monthDaySelected: {
    backgroundColor: colors.primary,
  },
  monthDayToday: {
    backgroundColor: colors.primaryLight,
  },
  monthDayOtherMonth: {
    opacity: 0.35,
  },
  monthDayNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  monthDayNumberSelected: {
    color: colors.white,
  },
  monthDayNumberOtherMonth: {
    color: colors.textSecondary,
  },
  monthEventDot: {
    position: 'absolute',
    bottom: 6,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
  },
  monthEventDotSelected: {
    backgroundColor: colors.white,
  },
});
