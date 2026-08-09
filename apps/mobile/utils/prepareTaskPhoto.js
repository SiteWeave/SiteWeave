import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

const TASK_PHOTO_MAX_DIMENSION = 1600;

export function jpegFileName(fileName) {
  if (!fileName) return undefined;
  const trimmed = String(fileName).trim();
  if (!trimmed) return undefined;
  const base = trimmed.replace(/\.[^.]+$/, '');
  return `${base || 'photo'}.jpg`;
}

function getImageSize(uri) {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });
}

/**
 * Resize and re-encode a local image URI for upload.
 * Caps the largest side (matches web) so portrait phone photos stay small.
 */
export async function preparePhotoForUpload(uri, { maxDimension = TASK_PHOTO_MAX_DIMENSION } = {}) {
  let actions = [];
  try {
    const { width, height } = await getImageSize(uri);
    const largestSide = Math.max(width, height);
    if (largestSide > maxDimension) {
      const scale = maxDimension / largestSide;
      actions = [
        {
          resize: {
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale)),
          },
        },
      ];
    }
  } catch {
    // If size probe fails, still re-encode via width cap as a safe fallback.
    actions = [{ resize: { width: maxDimension } }];
  }

  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.86,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return {
    uri: result.uri,
    mimeType: 'image/jpeg',
  };
}

/** @deprecated Prefer preparePhotoForUpload — same behavior. */
export async function prepareTaskPhotoForUpload(uri, options) {
  return preparePhotoForUpload(uri, options);
}
