import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { useSyncStatus } from '../context/SyncStatusContext';
import { presentSyncResultAlert } from '../utils/presentSyncResultAlert';
import { colors, spacing, touch } from '../theme';
import { useHaptics } from '../hooks/useHaptics';

export default function SyncStatusBanner({ style }) {
  const { t } = useTranslation();
  const haptics = useHaptics();
  const {
    isOnline,
    queueSize,
    isSyncing,
    lastSyncResult,
    flushQueue,
    clearQueue,
    formatSyncErrorSummary,
  } = useSyncStatus();

  if (isOnline && queueSize === 0 && !isSyncing) return null;

  const label = !isOnline
    ? t('mobile.sync_offline', { count: queueSize })
    : isSyncing
      ? t('mobile.sync_syncing')
      : t('mobile.sync_pending', { count: queueSize });

  const errorHint = lastSyncResult?.errors?.length
    ? formatSyncErrorSummary(lastSyncResult.errors)
    : lastSyncResult?.flushError || null;

  const handlePress = async () => {
    if (isSyncing) return;
    haptics.light();
    const sizeBefore = queueSize;
    const result = await flushQueue();
    presentSyncResultAlert({
      result,
      t,
      queueSize: result?.remaining ?? sizeBefore,
      formatSyncErrorSummary,
      clearQueue,
    });
  };

  return (
    <View style={style}>
      <PressableWithFade
        style={[styles.banner, !isOnline && styles.bannerOffline]}
        onPress={handlePress}
        disabled={isSyncing || (!isOnline && queueSize === 0)}
        testID="sync-status-banner"
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${t('mobile.sync_tap_retry')}`}
        hapticType="light"
      >
        {isSyncing ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons
            name={isOnline ? 'cloud-upload-outline' : 'cloud-offline-outline'}
            size={18}
            color={isOnline ? colors.primary : colors.error}
          />
        )}
        <Text variant="caption" style={styles.text}>
          {label}
        </Text>
        {isOnline && queueSize > 0 && !isSyncing ? (
          <Text variant="caption" style={styles.tap}>
            {t('mobile.sync_tap_retry')}
          </Text>
        ) : null}
      </PressableWithFade>
      {errorHint && queueSize > 0 && !isSyncing ? (
        <Text variant="caption" style={styles.errorHint} numberOfLines={2}>
          {errorHint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: touch.minSize - 12,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerOffline: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  text: { flex: 1, color: colors.text, fontWeight: '600' },
  tap: { color: colors.primary, fontWeight: '700' },
  errorHint: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    color: colors.error,
    fontSize: 12,
    lineHeight: 16,
  },
});
