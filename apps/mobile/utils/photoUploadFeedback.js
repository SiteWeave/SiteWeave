import { Alert } from 'react-native';

/**
 * Field-friendly photo failure: clear message + Retry / Retake (not a hanging spinner).
 */
export function alertPhotoUploadFailed({
  t,
  message,
  onRetry,
  onRetake,
}) {
  const buttons = [{ text: t('common.cancel'), style: 'cancel' }];
  if (typeof onRetry === 'function') {
    buttons.push({
      text: t('mobile.photo_retry', { defaultValue: 'Retry' }),
      onPress: onRetry,
    });
  }
  if (typeof onRetake === 'function') {
    buttons.push({
      text: t('mobile.photo_retake', { defaultValue: 'Retake' }),
      onPress: onRetake,
    });
  }
  Alert.alert(
    t('mobile.photo_not_saved_title', { defaultValue: 'Photo not saved' }),
    message ||
      t('mobile.photo_not_saved_message', {
        defaultValue: 'The photo did not upload. Retry, or take another.',
      }),
    buttons,
  );
}
