import * as ImageManipulator from 'expo-image-manipulator';
import { PROFILE_PHOTO_SIZE } from '@siteweave/core-logic';

/**
 * Square-crop, resize, and re-encode a local image URI for profile upload.
 * Converts HEIC/large photos to JPEG within upload limits.
 */
export async function prepareMobileAvatarUri(uri, { outputSize = PROFILE_PHOTO_SIZE } = {}) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: outputSize, height: outputSize } }],
    {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  return {
    uri: result.uri,
    mimeType: 'image/jpeg',
  };
}
