import { Alert } from 'react-native';

/**
 * Present alerts for offline sync flush results.
 * Shared by SyncStatusBanner and More tab so sync never fails silently.
 */
export function presentSyncResultAlert({
  result,
  t,
  queueSize = 0,
  formatSyncErrorSummary,
  clearQueue,
}) {
  if (!result) {
    Alert.alert(
      t('common.error'),
      t('mobile.sync_failed_body', { count: queueSize || 0 }),
    );
    return;
  }

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
          onPress: () =>
            showFailureDetails({
              result,
              t,
              queueSize,
              formatSyncErrorSummary,
              clearQueue,
            }),
        },
      ],
    );
    return;
  }

  if (result.remaining > 0 || result.failed > 0) {
    showFailureDetails({
      result,
      t,
      queueSize,
      formatSyncErrorSummary,
      clearQueue,
    });
    return;
  }

  if (result.dropped > 0) {
    Alert.alert(
      t('mobile.sync_dropped_title'),
      t('mobile.sync_dropped_body', { count: result.dropped }),
    );
    return;
  }

  // Empty/no-op flush (race, already synced elsewhere, or missing client).
  if ((queueSize || 0) > 0) {
    Alert.alert(
      t('mobile.sync_failed_title'),
      t('mobile.sync_noop_still_pending', { count: queueSize }),
    );
    return;
  }

  Alert.alert(
    t('mobile.sync_success_title'),
    t('mobile.sync_noop_empty'),
  );
}

function showFailureDetails({
  result,
  t,
  queueSize,
  formatSyncErrorSummary,
  clearQueue,
}) {
  const details =
    (typeof formatSyncErrorSummary === 'function'
      ? formatSyncErrorSummary(result.errors)
      : '') || t('mobile.sync_failed_body', { count: result.remaining || queueSize });

  const buttons = [{ text: t('common.done'), style: 'cancel' }];

  if (result.remaining > 0 && typeof clearQueue === 'function') {
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

  Alert.alert(t('mobile.sync_failed_title'), details, buttons);
}
