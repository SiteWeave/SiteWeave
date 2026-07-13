import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import PressableWithFade from './PressableWithFade';
import { Text } from './ui/Text';
import { colors, spacing, touch } from '../theme';
import { useBranding } from '../context/BrandingContext';

export default function PhaseAccordion({
  title,
  progressPercent = 0,
  taskCount = 0,
  expanded = true,
  onToggle,
  children,
  testID,
}) {
  const { t } = useTranslation();
  const { primaryColor } = useBranding();
  const progressValue = Math.max(0, Math.min(100, Number(progressPercent) || 0));

  return (
    <View style={styles.container} testID={testID}>
      <PressableWithFade
        style={styles.header}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        testID={testID ? `${testID}-toggle` : undefined}
      >
        <View style={styles.headerTop}>
          <View style={styles.titleWrap}>
            <Text style={styles.phaseName} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.taskCount}>
              {t('mobile.phase_task_count', { count: taskCount })}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textMuted}
          />
        </View>
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressValue}%`, backgroundColor: primaryColor }]} />
          </View>
          <Text style={styles.progressText}>{progressValue}%</Text>
        </View>
      </PressableWithFade>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  header: {
    paddingVertical: spacing.md,
    minHeight: touch.minRowHeight,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  phaseName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  taskCount: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    minWidth: 40,
    textAlign: 'right',
    fontVariant: 'tabular-nums',
  },
  body: {
    paddingTop: spacing.xs,
  },
});
