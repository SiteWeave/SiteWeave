import { useState } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
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

export default function DateField({
  label,
  value,
  onChange,
  placeholder = 'Not set',
  disabled = false,
  minimumDate,
  maximumDate,
  testID,
}) {
  const [showPicker, setShowPicker] = useState(false);
  const parsed = parseDate(value);

  const display = parsed
    ? parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : placeholder;

  const handleChange = (_event, selected) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selected) onChange?.(toIsoDate(selected));
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
        accessibilityLabel={label || 'Select date'}
      >
        <Text style={[styles.value, !parsed && styles.placeholder]}>{display}</Text>
        <Ionicons name="calendar-outline" size={22} color={colors.textMuted} />
      </PressableWithFade>
      {parsed && !disabled ? (
        <PressableWithFade style={styles.clear} onPress={() => onChange?.(null)} testID={`${testID}-clear`}>
          <Text variant="caption" style={styles.clearText}>
            Clear
          </Text>
        </PressableWithFade>
      ) : null}
      {showPicker ? (
        <DateTimePicker
          value={parsed || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
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
  clear: { alignSelf: 'flex-start', marginTop: spacing.xs, paddingVertical: spacing.xs },
  clearText: { color: colors.primary, fontWeight: '600' },
  done: {
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: touch.minSize,
    justifyContent: 'center',
  },
  doneText: { fontSize: 17, fontWeight: '700', color: colors.primary },
});
