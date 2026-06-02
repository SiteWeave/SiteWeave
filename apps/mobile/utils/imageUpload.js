import * as FileSystem from 'expo-file-system/legacy';

function base64ToUint8Array(base64) {
  const decode =
    globalThis.atob ||
    ((str) => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      let output = '';
      const cleaned = str.replace(/[^A-Za-z0-9+/=]/g, '');
      for (let i = 0; i < cleaned.length; i += 4) {
        const enc1 = chars.indexOf(cleaned.charAt(i));
        const enc2 = chars.indexOf(cleaned.charAt(i + 1));
        const enc3 = chars.indexOf(cleaned.charAt(i + 2));
        const enc4 = chars.indexOf(cleaned.charAt(i + 3));
        output += String.fromCharCode((enc1 << 2) | (enc2 >> 4));
        if (enc3 !== 64) output += String.fromCharCode(((enc2 & 15) << 4) | (enc3 >> 2));
        if (enc4 !== 64) output += String.fromCharCode(((enc3 & 3) << 6) | enc4);
      }
      return output;
    });
  const binary = decode(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function extensionFromUri(uri, mimeType) {
  if (mimeType?.includes('png')) return 'png';
  if (mimeType?.includes('heic') || mimeType?.includes('heif')) return 'heic';
  if (mimeType?.includes('webp')) return 'webp';
  const match = String(uri).match(/\.([a-z0-9]+)(?:\?|$)/i);
  return match?.[1]?.toLowerCase() || 'jpg';
}

/**
 * Read a local image URI into a Blob-like object for Supabase storage upload.
 * React Native fetch(file://) is unreliable; expo-file-system base64 is used instead.
 */
export async function uriToUploadFile(uri, { mimeType = 'image/jpeg', fileName } = {}) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToUint8Array(base64);
  const type = mimeType || 'image/jpeg';
  const ext = extensionFromUri(uri, type);
  const name = fileName || `photo-${Date.now()}.${ext}`;

  const blob = new Blob([bytes], { type });
  try {
    Object.defineProperty(blob, 'name', { value: name, configurable: true });
    Object.defineProperty(blob, 'size', { value: bytes.length, configurable: true });
  } catch {
    // Some RN runtimes omit name/size; storage still works with contentType.
  }
  return blob;
}
