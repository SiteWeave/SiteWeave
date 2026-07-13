import { useState, useMemo, useCallback } from 'react';
import { View, Modal, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import PressableWithFade from '../PressableWithFade';
import { Text } from './Text';
import { colors, spacing, touch } from '../../theme';

function parseDate(value) {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDate(date) {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShort(iso) {
  const d = parseDate(iso);
  if (!d) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function addMonths(date, delta) {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + delta);
  if (next.getDate() !== day) next.setDate(0);
  return next;
}

function getRangeState(iso, startIso, endIso) {
  if (!startIso) return 'none';
  if (!endIso) return iso === startIso ? 'start' : 'none';
  if (startIso === endIso && iso === startIso) return 'single';
  if (iso === startIso) return 'start';
  if (iso === endIso) return 'end';
  if (iso > startIso && iso < endIso) return 'middle';
  return 'none';
}

function buildMonthWeeks(anchor) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const dates = [];
  for (let i = 0; i < 35; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }

  const weeks = [];
  for (let i = 0; i < dates.length; i += 7) {
    weeks.push(dates.slice(i, i + 7));
  }
  return weeks;
}

function WeekRow({ days, viewMonth, draftStart, draftEnd, onDayPress }) {
  const rangeStates = days.map((date) => {
    const iso = toIsoDate(date);
    const inMonth = date.getMonth() === viewMonth.getMonth();
    return inMonth ? getRangeState(iso, draftStart, draftEnd) : 'none';
  });

  let barLeft = null;
  let barWidth = null;
  if (draftStart && draftEnd) {
    const indices = rangeStates
      .map((state, index) => (state !== 'none' ? index : -1))
      .filter((index) => index >= 0);
    if (indices.length > 0) {
      const first = Math.min(...indices);
      const last = Math.max(...indices);
      barLeft = `${(first / 7) * 100}%`;
      barWidth = `${((last - first + 1) / 7) * 100}%`;
    }
  }

  return (
    <View style={styles.weekRow}>
      {barLeft != null ? (
        <View style={[styles.weekRangeBar, { left: barLeft, width: barWidth }]} />
      ) : null}
      {days.map((date, index) => {
        const iso = toIsoDate(date);
        const inMonth = date.getMonth() === viewMonth.getMonth();
        const rangeState = rangeStates[index];
        const isEndpoint =
          rangeState === 'start' || rangeState === 'end' || rangeState === 'single';

        return (
          <View key={`${iso}-${index}`} style={styles.daySlot}>
            <PressableWithFade
              containerStyle={styles.fillPressable}
              style={styles.dayCell}
              onPress={() => inMonth && onDayPress(date)}
              disabled={!inMonth}
              accessibilityRole="button"
              accessibilityState={{ selected: isEndpoint }}
            >
              <View style={[styles.dayCircle, isEndpoint && styles.dayCircleEndpoint]}>
                <Text
                  style={[
                    styles.dayText,
                    !inMonth && styles.dayTextMuted,
                    isEndpoint && styles.dayTextEndpoint,
                    rangeState === 'middle' && styles.dayTextInRange,
                  ]}
                >
                  {date.getDate()}
                </Text>
              </View>
            </PressableWithFade>
          </View>
        );
      })}
    </View>
  );
}

export default function DateRangeField({
  label,
  startValue,
  endValue,
  onChange,
  placeholder = 'Select dates',
  disabled = false,
  testID = 'date-range-field',
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const [visible, setVisible] = useState(false);
  const [draftStart, setDraftStart] = useState(null);
  const [draftEnd, setDraftEnd] = useState(null);
  const [viewMonth, setViewMonth] = useState(() => parseDate(startValue) || new Date());

  const openPicker = () => {
    if (disabled) return;
    setDraftStart(startValue || null);
    setDraftEnd(endValue || null);
    setViewMonth(parseDate(startValue) || parseDate(endValue) || new Date());
    setVisible(true);
  };

  const closePicker = () => setVisible(false);

  const displayLabel = (() => {
    const start = formatShort(startValue);
    const end = formatShort(endValue);
    if (start && end) return `${start} – ${end}`;
    if (start) return `${start} – …`;
    return placeholder;
  })();

  const handleDayPress = useCallback(
    (date) => {
      const iso = toIsoDate(date);
      if (!draftStart || (draftStart && draftEnd)) {
        setDraftStart(iso);
        setDraftEnd(null);
        onChange?.({ start_date: iso, due_date: null });
        return;
      }
      if (iso < draftStart) {
        setDraftEnd(draftStart);
        setDraftStart(iso);
        onChange?.({ start_date: iso, due_date: draftStart });
        return;
      }
      setDraftEnd(iso);
      onChange?.({ start_date: draftStart, due_date: iso });
    },
    [draftStart, draftEnd, onChange],
  );

  const handleClear = () => {
    setDraftStart(null);
    setDraftEnd(null);
    onChange?.({ start_date: null, due_date: null });
  };

  const monthWeeks = useMemo(() => buildMonthWeeks(viewMonth), [viewMonth]);
  const weekDayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        new Date(2024, 0, 7 + index).toLocaleDateString(locale, { weekday: 'short' }),
      ),
    [locale],
  );
  const monthTitle = viewMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const hint =
    !draftStart || draftEnd
      ? t('mobile.date_range_hint_start')
      : t('mobile.date_range_hint_end');

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="caption" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <PressableWithFade
        style={[styles.field, disabled && styles.fieldDisabled]}
        onPress={openPicker}
        disabled={disabled}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label || 'Select date range'}
      >
        <Text style={[styles.value, !(startValue || endValue) && styles.placeholder]} numberOfLines={1}>
          {displayLabel}
        </Text>
        <Ionicons name="calendar-outline" size={22} color={colors.textMuted} />
      </PressableWithFade>

      <Modal transparent animationType="fade" visible={visible} onRequestClose={closePicker}>
        <Pressable style={styles.backdrop} onPress={closePicker} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('mobile.project_date_range')}</Text>
            <PressableWithFade onPress={closePicker} hitSlop={touch.hitSlop}>
              <Text style={styles.sheetAction}>{t('common.done')}</Text>
            </PressableWithFade>
          </View>

          <Text variant="caption" style={styles.hint}>{hint}</Text>

          <View style={styles.monthNav}>
            <PressableWithFade
              style={styles.navBtn}
              onPress={() => setViewMonth((m) => addMonths(m, -1))}
              accessibilityLabel={t('mobile.calendar_prev_month')}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </PressableWithFade>
            <Text style={styles.monthTitle}>{monthTitle}</Text>
            <PressableWithFade
              style={styles.navBtn}
              onPress={() => setViewMonth((m) => addMonths(m, 1))}
              accessibilityLabel={t('mobile.calendar_next_month')}
            >
              <Ionicons name="chevron-forward" size={22} color={colors.text} />
            </PressableWithFade>
          </View>

          <View style={styles.calendarBody}>
            <View style={styles.weekHeader}>
              {weekDayLabels.map((day, index) => (
                <View key={`${day}-${index}`} style={styles.daySlot}>
                  <Text style={styles.weekLabel}>{day}</Text>
                </View>
              ))}
            </View>

            <View style={styles.monthGrid}>
              {monthWeeks.map((week, weekIndex) => (
                <WeekRow
                  key={`week-${weekIndex}`}
                  days={week}
                  viewMonth={viewMonth}
                  draftStart={draftStart}
                  draftEnd={draftEnd}
                  onDayPress={handleDayPress}
                />
              ))}
            </View>
          </View>

          <View style={styles.sheetFooter}>
            <PressableWithFade onPress={handleClear} style={styles.clearBtn}>
              <Text style={styles.clearText}>{t('mobile.date_range_clear')}</Text>
            </PressableWithFade>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  label: { marginBottom: spacing.sm, color: colors.textMuted },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: touch.minSize,
    backgroundColor: colors.surface,
  },
  fieldDisabled: { opacity: 0.5 },
  value: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginRight: spacing.sm,
    textAlignVertical: 'center',
  },
  placeholder: { color: colors.textSubtle, fontWeight: '400' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: spacing.xxl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  sheetAction: { fontSize: 17, fontWeight: '700', color: colors.primary },
  hint: {
    textAlign: 'center',
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  navBtn: {
    width: touch.minSize,
    height: touch.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  calendarBody: {
    width: '100%',
    paddingHorizontal: spacing.lg,
  },
  weekHeader: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: spacing.xs,
  },
  daySlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fillPressable: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
  },
  weekLabel: {
    fontSize: 12,
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
    position: 'relative',
    height: 42,
    alignItems: 'center',
  },
  weekRangeBar: {
    position: 'absolute',
    top: 4,
    height: 34,
    backgroundColor: colors.primaryLight,
    zIndex: 0,
  },
  dayCell: {
    width: '100%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleEndpoint: {
    backgroundColor: colors.primary,
  },
  dayText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  dayTextMuted: {
    color: colors.textSubtle,
  },
  dayTextEndpoint: {
    color: colors.white,
    fontWeight: '700',
  },
  dayTextInRange: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  sheetFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'flex-end',
  },
  clearBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  clearText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
