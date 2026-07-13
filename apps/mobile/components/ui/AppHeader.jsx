import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PressableWithFade from '../PressableWithFade';
import { Text } from './Text';
import { colors, spacing, touch } from '../../theme';

export default function AppHeader({ title, onBack, rightAction, testID, dense = false }) {
  return (
    <View style={[styles.header, dense && styles.headerDense]} testID={testID}>
      {onBack ? (
        <PressableWithFade
          onPress={onBack}
          style={styles.side}
          hitSlop={touch.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID={testID ? `${testID}-back` : undefined}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </PressableWithFade>
      ) : (
        <View style={styles.side} />
      )}
      <Text variant="screenTitle" style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {rightAction ? <View style={styles.side}>{rightAction}</View> : <View style={styles.side} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    minHeight: touch.minRowHeight,
  },
  headerDense: {
    marginBottom: spacing.sm,
  },
  side: {
    width: touch.minSize,
    height: touch.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
  },
});
