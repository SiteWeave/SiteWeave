import * as ImageManipulator from 'expo-image-manipulator';

const TASK_PHOTO_MAX_DIMENSION = 1600;

/**
 * Resize and re-encode a local image URI for task photo upload.
 * Converts HEIC/large photos to JPEG within bucket limits.
 */
export async function prepareTaskPhotoForUpload(uri, { maxDimension = TASK_PHOTO_MAX_DIMENSION } = {}) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxDimension } }],
    {
      compress: 0.86,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  return {
    uri: result.uri,
    mimeType: 'image/jpeg',
  };
}
