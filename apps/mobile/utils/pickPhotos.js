import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { IMAGE_MEDIA_TYPES } from './imagePickerMediaTypes';

/** Soft cap so one batch does not overwhelm upload/storage. */
export const DEFAULT_PHOTO_SELECTION_LIMIT = 10;

const BASE_PICKER_OPTIONS = {
  mediaTypes: IMAGE_MEDIA_TYPES,
  quality: 0.8,
  allowsEditing: false,
};

/**
 * @param {object} [options]
 * @param {number} [options.selectionLimit]
 * @returns {Promise<ImagePicker.ImagePickerAsset[]>}
 */
export async function launchPhotoLibraryAsync({
  selectionLimit = DEFAULT_PHOTO_SELECTION_LIMIT,
} = {}) {
  const result = await ImagePicker.launchImageLibraryAsync({
    ...BASE_PICKER_OPTIONS,
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, selectionLimit),
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.filter((asset) => asset?.uri);
}

/**
 * @returns {Promise<ImagePicker.ImagePickerAsset[]>}
 */
export async function launchPhotoCameraAsync() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    const err = new Error('CAMERA_PERMISSION_DENIED');
    err.code = 'CAMERA_PERMISSION_DENIED';
    throw err;
  }
  const result = await ImagePicker.launchCameraAsync({
    ...BASE_PICKER_OPTIONS,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return [];
  return [result.assets[0]];
}

function askTakeAnotherPhoto(t) {
  return new Promise((resolve) => {
    Alert.alert(
      t('mobile.photo_take_another_title', { defaultValue: 'Add another photo?' }),
      t('mobile.photo_take_another_body', {
        defaultValue: 'Keep the ones you took, or capture another.',
      }),
      [
        {
          text: t('common.done', { defaultValue: 'Done' }),
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: t('mobile.photo_take_another', { defaultValue: 'Take another' }),
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Pick one or more photos from camera (sequential) or library (multi-select).
 *
 * @param {object} options
 * @param {'camera' | 'library'} options.mode
 * @param {(key: string, opts?: object) => string} options.t
 * @param {number} [options.selectionLimit]
 * @param {boolean} [options.allowMultipleCamera=true] - After each camera shot, offer Take another.
 * @returns {Promise<ImagePicker.ImagePickerAsset[]>}
 */
export async function pickPhotos({
  mode,
  t,
  selectionLimit = DEFAULT_PHOTO_SELECTION_LIMIT,
  allowMultipleCamera = true,
}) {
  if (mode === 'library') {
    return launchPhotoLibraryAsync({ selectionLimit });
  }

  const assets = [];
  const limit = Math.max(1, selectionLimit);

  while (assets.length < limit) {
    const next = await launchPhotoCameraAsync();
    if (!next.length) {
      // User canceled this shot — keep any already captured.
      break;
    }
    assets.push(...next);
    if (!allowMultipleCamera || assets.length >= limit) break;
    const again = await askTakeAnotherPhoto(t);
    if (!again) break;
  }

  return assets;
}
