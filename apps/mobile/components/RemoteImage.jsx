import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../theme';

/**
 * Cached remote image with optional thumb sizing hints for FlashList recycling.
 */
export default function RemoteImage({
  uri,
  style,
  contentFit = 'cover',
  recyclingKey,
  transition = 120,
  ...props
}) {
  if (!uri) {
    return null;
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.base, style]}
      contentFit={contentFit}
      recyclingKey={recyclingKey || uri}
      transition={transition}
      cachePolicy="memory-disk"
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceMuted || colors.border,
  },
});
