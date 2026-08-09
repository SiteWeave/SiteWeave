import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PressableWithFade from './PressableWithFade';
import RemoteImage from './RemoteImage';
import { colors, spacing } from '../theme';

/**
 * Local-first photo thumb: shows preview immediately, with uploading / failed overlays.
 */
export default function PhotoStatusThumb({
  uri,
  status = 'ready',
  onRetry,
  onPress,
  testID,
  accessibilityLabel,
}) {
  const showUri = uri;
  const failed = status === 'failed';
  const uploading = status === 'uploading';

  return (
    <PressableWithFade
      style={styles.wrap}
      onPress={failed ? onRetry : onPress}
      disabled={!failed && !onPress}
      hapticType="light"
      testID={testID}
      accessibilityRole={failed ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {showUri ? (
        <RemoteImage uri={showUri} style={styles.image} recyclingKey={showUri} transition={0} />
      ) : (
        <View style={[styles.image, styles.placeholder]} />
      )}
      {uploading ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={colors.white} size="small" />
        </View>
      ) : null}
      {failed ? (
        <View style={styles.overlay}>
          <Ionicons name="refresh" size={22} color={colors.white} />
        </View>
      ) : null}
      {status === 'ready' ? (
        <View style={styles.checkBadge} pointerEvents="none">
          <Ionicons name="checkmark" size={12} color={colors.white} />
        </View>
      ) : null}
    </PressableWithFade>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    marginRight: spacing.sm,
    borderRadius: 10,
    overflow: 'hidden',
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.border,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
