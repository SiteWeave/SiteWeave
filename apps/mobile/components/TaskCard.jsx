import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import PressableWithFade from './PressableWithFade';
import ProgressPill from './ui/ProgressPill';
import { Text } from './ui/Text';
import { colors, spacing, touch, shadows } from '../theme';
import { useBranding } from '../context/BrandingContext';
import { daysFromDueToToday } from '../utils/myDay';

function taskPercent(task) {
  if (task?.completed) return 100;
  const p = Number(task?.percent_complete);
  return Number.isFinite(p) ? Math.max(0, Math.min(100, Math.round(p))) : 0;
}

export default function TaskCard({
  task,
  onPress,
  onProgressPress,
  onPhotoPress,
  canManagePhotos = true,
  photoUploading = false,
  variant = 'default',
  isLast = false,
  testID,
}) {
  const { t, i18n } = useTranslation();
  const { primaryColor } = useBranding();
  const percent = taskPercent(task);

  const formatDue = (due) => {
    if (!due) return null;
    try {
      return new Date(`${due}T12:00:00`).toLocaleDateString(i18n.language?.startsWith('es') ? 'es' : 'en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return due;
    }
  };

  const due = formatDue(task.due_date);
  const dueOffset = daysFromDueToToday(task.due_date);
  const isOverdue = dueOffset != null && dueOffset > 0 && !task.completed;

  const Wrapper = onPress ? PressableWithFade : View;
  const wrapperProps = onPress
    ? { onPress: () => onPress(task), static: true, accessibilityRole: 'button' }
    : {};

  const isFlat = variant === 'flat';

  return (
    <Wrapper
      style={[styles.card, isFlat && styles.cardFlat, isFlat && isLast && styles.cardFlatLast]}
      testID={testID}
      {...wrapperProps}
    >
      <View style={[styles.accent, { backgroundColor: primaryColor }]} />
      <View style={styles.inner}>
        <Text variant="body" style={styles.title} numberOfLines={1}>
          {task.text || t('mobile.untitled_task')}
        </Text>

        <View style={styles.trailing}>
          <ProgressPill
            percent={percent}
            compact
            onPress={() => onProgressPress?.(task)}
            testID={`${testID}-progress`}
          />
          {due ? (
            <Text style={[styles.dueText, isOverdue && styles.dueOverdue]} numberOfLines={1}>
              {due}
            </Text>
          ) : null}
          {canManagePhotos ? (
            <PressableWithFade
              onPress={() => onPhotoPress?.(task)}
              style={styles.iconBtn}
              hitSlop={touch.hitSlop}
              disabled={photoUploading}
              testID={`${testID}-photo`}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.add_photo')}
            >
              <Ionicons name="camera-outline" size={22} color={photoUploading ? colors.textSubtle : primaryColor} />
            </PressableWithFade>
          ) : null}
        </View>
      </View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginBottom: spacing.md,
    minHeight: touch.minRowHeight,
    overflow: 'hidden',
    ...shadows.card,
  },
  cardFlat: {
    borderRadius: 0,
    marginBottom: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardFlatLast: {
    borderBottomWidth: 0,
  },
  accent: { width: 4 },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minWidth: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontWeight: '600',
    fontSize: 16,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    flexShrink: 0,
  },
  dueText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    maxWidth: 80,
  },
  dueOverdue: {
    color: colors.error,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
