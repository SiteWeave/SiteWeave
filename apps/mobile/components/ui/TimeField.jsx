import { useState, useMemo } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import PressableWithFade from '../PressableWithFade';
import { Text } from './Text';
import { colors, spacing, touch } from '../../theme';
import {
  formatLocalTime,
  parseTimeOnDate,
  roundTimeToInterval,
  toLocalDateIso,
} from '../../utils/dateHelpers';

function parseTimeValue(value, dateIso) {
  const base = parseTimeOnDate(dateIso || toLocalDateIso(new Date()), value || '09:00');
  return roundTimeToInterval(base, 15);
}

export default function TimeField({
  label,
  value,
  onChange,
  dateIso,
  placeholder = 'Select time',
  disabled = false,
  testID,
}) {
  const [showPicker, setShowPicker] = useState(false);
  const parsed = useMemo(() => parseTimeValue(value, dateIso), [value, dateIso]);

  const display = parsed.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  const handleChange = (_event, selected) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selected) {
      const rounded = roundTimeToInterval(selected, 15);
      onChange?.(formatLocalTime(rounded));
    }
  };

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="caption" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <PressableWithFade
        style={[styles.field, disabled && styles.fieldDisabled]}
        onPress={() => !disabled && setShowPicker(true)}
        disabled={disabled}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label || 'Select time'}
      >
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value ? display : placeholder}
        </Text>
        <Ionicons name="time-outline" size={22} color={colors.textMuted} />
      </PressableWithFade>
      {showPicker ? (
        <DateTimePicker
          value={parsed}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
          minuteInterval={15}
        />
      ) : null}
      {showPicker && Platform.OS === 'ios' ? (
        <PressableWithFade style={styles.done} onPress={() => setShowPicker(false)} testID={`${testID}-done`}>
          <Text style={styles.doneText}>Done</Text>
        </PressableWithFade>
      ) : null}
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
    minHeight: touch.minSize,
    backgroundColor: colors.surface,
  },
  fieldDisabled: { opacity: 0.6 },
  value: { fontSize: 17, color: colors.text, flex: 1 },
  placeholder: { color: colors.textSubtle },
  done: {
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: touch.minSize,
    justifyContent: 'center',
  },
  doneText: { fontSize: 17, fontWeight: '700', color: colors.primary },
});
