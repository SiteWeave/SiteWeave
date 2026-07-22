import { View, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';
import { useBranding } from '../context/BrandingContext';

/**
 * Segmented progress for auth onboarding (e.g. 3 of 4 filled).
 */
export default function OnboardingProgressBar({
  totalSteps = 4,
  currentStep = 1,
  style,
  testID = 'onboarding-progress',
}) {
  const { primaryColor } = useBranding();
  const safeTotal = Math.max(1, totalSteps);
  const safeCurrent = Math.min(Math.max(1, currentStep), safeTotal);

  return (
    <View style={[styles.row, style]} testID={testID} accessibilityRole="progressbar">
      {Array.from({ length: safeTotal }, (_, index) => {
        const filled = index < safeCurrent;
        return (
          <View
            key={`step-${index}`}
            style={[
              styles.segment,
              { backgroundColor: filled ? primaryColor : colors.border },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 999,
  },
});
