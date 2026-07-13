import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native';

import { useTranslation } from 'react-i18next';

import { Ionicons } from '@expo/vector-icons';

import { Text } from './ui/Text';

import PressableWithFade from './PressableWithFade';

import { useSyncStatus } from '../context/SyncStatusContext';

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



  const showSyncAlert = (result) => {

    if (result.flushError) {

      Alert.alert(t('common.error'), result.flushError);

      return;

    }



    if (result.processed > 0 && result.remaining === 0) {

      Alert.alert(

        t('mobile.sync_success_title'),

        t('mobile.sync_success_body', { count: result.processed }),

      );

      return;

    }



    if (result.processed > 0 && result.remaining > 0) {

      Alert.alert(

        t('mobile.sync_partial_title'),

        t('mobile.sync_partial_body', {

          processed: result.processed,

          remaining: result.remaining,

        }),

        [

          { text: t('common.done'), style: 'cancel' },

          {

            text: t('mobile.sync_view_details'),

            onPress: () => showFailureDetails(result),

          },

        ],

      );

      return;

    }



    if (result.remaining > 0 || result.failed > 0) {

      showFailureDetails(result);

      return;

    }



    if (result.dropped > 0) {

      Alert.alert(

        t('mobile.sync_dropped_title'),

        t('mobile.sync_dropped_body', { count: result.dropped }),

      );

    }

  };



  const showFailureDetails = (result) => {

    const details = formatSyncErrorSummary(result.errors);

    const buttons = [{ text: t('common.done'), style: 'cancel' }];



    if (result.remaining > 0) {

      buttons.push({

        text: t('mobile.sync_clear_queue'),

        style: 'destructive',

        onPress: () => {

          Alert.alert(

            t('mobile.sync_clear_queue_title'),

            t('mobile.sync_clear_queue_body', { count: result.remaining }),

            [

              { text: t('common.cancel'), style: 'cancel' },

              {

                text: t('mobile.sync_clear_queue_confirm'),

                style: 'destructive',

                onPress: () => clearQueue(),

              },

            ],

          );

        },

      });

    }



    Alert.alert(

      t('mobile.sync_failed_title'),

      details || t('mobile.sync_failed_body', { count: result.remaining || queueSize }),

      buttons,

    );

  };



  const handlePress = async () => {

    if (isSyncing) return;

    haptics.light();

    const result = await flushQueue();

    showSyncAlert(result);

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


