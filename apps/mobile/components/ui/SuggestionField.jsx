import { useState } from 'react';
import { View, StyleSheet, Keyboard } from 'react-native';
import PressableWithFade from '../PressableWithFade';
import SheetInput from './SheetInput';
import { Text } from './Text';
import { colors, spacing, touch } from '../../theme';

export default function SuggestionField({
  label,
  value,
  onChangeText,
  suggestions = [],
  suggestionLabel,
  onSelectSuggestion,
  renderSuggestion,
  placeholder,
  placeholderTextColor = colors.textSubtle,
  multiline = false,
  editable = true,
  testID,
  inputStyle,
  numberOfLines,
}) {
  const [focused, setFocused] = useState(false);
  const showSuggestions = focused && suggestions.length > 0;

  const handleFocus = () => {
    setFocused(true);
  };

  const handleSelect = (item) => {
    onSelectSuggestion?.(item);
    Keyboard.dismiss();
    setFocused(false);
  };

  return (
    <View style={styles.wrap} testID={testID}>
      {label ? (
        <Text variant="caption" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <SheetInput
        style={[styles.input, multiline && styles.textArea, inputStyle]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        multiline={multiline}
        numberOfLines={numberOfLines}
        editable={editable}
        onFocus={handleFocus}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        testID={testID ? `${testID}-input` : undefined}
      />
      {showSuggestions ? (
        <View style={styles.suggestionPanel} testID={testID ? `${testID}-suggestions` : undefined}>
          {suggestionLabel ? (
            <Text variant="caption" style={styles.suggestionLabel}>
              {suggestionLabel}
            </Text>
          ) : null}
          {suggestions.map((item, index) => (
            <PressableWithFade
              key={item.id || item.email || item.label || String(index)}
              style={styles.suggestionRow}
              onPress={() => handleSelect(item)}
              testID={testID ? `${testID}-suggestion-${index}` : undefined}
            >
              {renderSuggestion ? (
                renderSuggestion(item)
              ) : (
                <Text variant="bodyMedium" style={styles.suggestionText} numberOfLines={2}>
                  {item.label || item.address || item.email}
                </Text>
              )}
            </PressableWithFade>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    color: colors.textSubtle,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    fontSize: 17,
    fontWeight: '500',
    minHeight: touch.minSize,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  suggestionPanel: {
    marginTop: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  suggestionLabel: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    color: colors.textSubtle,
    fontWeight: '500',
  },
  suggestionRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: touch.minSize,
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  suggestionText: { color: colors.text },
});
