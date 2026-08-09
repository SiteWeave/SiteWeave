/**
 * expo-image-picker SDK 54+ expects MediaType strings (or arrays), not MediaTypeOptions.
 * Avoid reading MediaTypeOptions — accessing it logs a deprecation warning.
 */
export const IMAGE_MEDIA_TYPES = ['images'];
