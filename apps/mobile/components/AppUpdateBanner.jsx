import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './ui/Text';
import PressableWithFade from './PressableWithFade';
import { useAppUpdate } from '../context/AppUpdateContext';
import { colors, spacing, touch } from '../theme';

export default function AppUpdateBanner({ style }) {
  const { t } = useTranslation();
  const {
    storeUpdateRequired,
    storeUpdateSoft,
    isOtaDownloading,
    isOtaPending,
    isApplyingUpdate,
    applyUpdateNow,
    openStore,
    dismissSoftStoreUpdate,
  } = useAppUpdate();

  if (storeUpdateRequired) return null;

  if (storeUpdateSoft) {
    return (
      <View style={[styles.banner, style]} testID="app-update-banner-store">
        <Ionicons name="storefront-outline" size={18} color={colors.primary} />
        <Text variant="caption" style={styles.text}>
          {t('mobile.update_store_available')}
        </Text>
        <PressableWithFade onPress={openStore} style={styles.action} testID="app-update-open-store">
          <Text variant="caption" style={styles.actionText}>
            {t('mobile.update_open_store')}
          </Text>
        </PressableWithFade>
        <PressableWithFade
          onPress={dismissSoftStoreUpdate}
          style={styles.dismiss}
          testID="app-update-dismiss-store"
          accessibilityLabel={t('common.close')}
        >
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </PressableWithFade>
      </View>
    );
  }

  if (!isOtaDownloading && !isOtaPending) return null;

  return (
    <View style={[styles.banner, style]} testID="app-update-banner-ota">
      {isOtaDownloading || isApplyingUpdate ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name="cloud-download-outline" size={18} color={colors.primary} />
      )}
      <Text variant="caption" style={styles.text}>
        {isOtaDownloading
          ? t('mobile.update_downloading')
          : t('mobile.update_ready_next_launch')}
      </Text>
      {isOtaPending && !isApplyingUpdate ? (
        <PressableWithFade
          onPress={applyUpdateNow}
          style={styles.action}
          testID="app-update-restart-now"
        >
          <Text variant="caption" style={styles.actionText}>
            {t('mobile.update_restart_now')}
          </Text>
        </PressableWithFade>
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
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: touch.minSize - 12,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    flex: 1,
    color: colors.text,
    fontWeight: '600',
  },
  action: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actionText: {
    color: colors.primary,
    fontWeight: '700',
  },
  dismiss: {
    minWidth: touch.minSize - 20,
    minHeight: touch.minSize - 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
