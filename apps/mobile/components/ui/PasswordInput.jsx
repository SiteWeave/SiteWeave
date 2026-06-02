import { View, TextInput, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, touch } from '../../theme';

/**
 * Password field with show/hide toggle. Eye sits above the input (zIndex) so taps register.
 * `key` remount fixes iOS not updating secureTextEntry when toggled.
 */
export default function PasswordInput({
  value,
  onChangeText,
  placeholder,
  showPassword,
  onToggleShow,
  testID,
  autoComplete = 'password',
}) {
  return (
    <View style={styles.wrap}>
      <TextInput
        key={showPassword ? `${testID}-visible` : `${testID}-secure`}
        style={styles.input}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType={showPassword ? 'none' : 'password'}
        placeholderTextColor={colors.textSubtle}
        testID={testID}
      />
      <Pressable
        style={styles.eye}
        onPress={onToggleShow}
        hitSlop={touch.hitSlop}
        accessibilityRole="button"
        accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
        testID={testID ? `${testID}-toggle` : undefined}
      >
        <Ionicons
          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
          size={24}
          color={colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    padding: spacing.lg,
    paddingRight: 56,
    fontSize: 17,
    minHeight: touch.minSize,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  eye: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: touch.minSize + 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 10,
  },
});
