import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme';

/**
 * Shared notification badge for tab bar, headers, etc.
 */
export default function NotificationBadge({ count, style, testID }) {
  if (!count || count <= 0) return null;

  const label = count > 99 ? '99+' : String(count);

  return (
    <View
      style={[styles.badge, count > 9 && styles.badgeWide, style]}
      testID={testID}
      accessibilityLabel={`${count} unread`}
    >
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeWide: {
    minWidth: 22,
    paddingHorizontal: 5,
  },
  text: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    fontVariant: 'tabular-nums',
  },
});
