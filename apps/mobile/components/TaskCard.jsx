import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import PressableWithFade from './PressableWithFade';
import ProgressPill from './ui/ProgressPill';
import { Text } from './ui/Text';
import { colors, spacing, touch, shadows } from '../theme';
import { useBranding } from '../context/BrandingContext';

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
  photoUploading = false,
  testID,
}) {
  const { t, i18n } = useTranslation();
  const { primaryColor } = useBranding();
  const percent = taskPercent(task);

  const formatDue = (due) => {
    if (!due) return null;
    try {
      return new Date(due).toLocaleDateString(i18n.language?.startsWith('es') ? 'es' : 'en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return due;
    }
  };

  const due = formatDue(task.due_date);

  const Wrapper = onPress ? PressableWithFade : View;
  const wrapperProps = onPress
    ? { onPress: () => onPress(task), activeOpacity: 0.92, accessibilityRole: 'button' }
    : {};

  return (
    <Wrapper style={styles.card} testID={testID} {...wrapperProps}>
      <View style={[styles.accent, { backgroundColor: primaryColor }]} />
      <View style={styles.inner}>
        <Text variant="body" style={styles.title} numberOfLines={2}>
          {task.text || t('mobile.untitled_task')}
        </Text>

        <View style={styles.meta}>
          <ProgressPill percent={percent} onPress={() => onProgressPress?.(task)} testID={`${testID}-progress`} />
          {due ? (
            <View style={styles.dateBadge}>
              <Text style={styles.dateText}>{due}</Text>
            </View>
          ) : null}
          <View style={styles.spacer} />
          <PressableWithFade
            onPress={() => onPhotoPress?.(task)}
            style={styles.iconBtn}
            hitSlop={touch.hitSlop}
            disabled={photoUploading}
            testID={`${testID}-photo`}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.add_photo')}
          >
            <Ionicons name="camera-outline" size={24} color={photoUploading ? colors.textSubtle : primaryColor} />
          </PressableWithFade>
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
  accent: { width: 4 },
  inner: { flex: 1, padding: spacing.lg },
  title: { fontWeight: '600', fontSize: 17, marginBottom: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dateBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  spacer: { flex: 1 },
  iconBtn: {
    width: touch.minSize,
    height: touch.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
