import { View, StyleSheet } from 'react-native';
import PressableWithFade from '../PressableWithFade';
import { colors, radius, shadows, spacing } from '../../theme';

export default function Card({ children, onPress, style, testID }) {
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (onPress) {
    return (
      <PressableWithFade onPress={onPress} testID={testID} activeOpacity={0.92}>
        {content}
      </PressableWithFade>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
});
