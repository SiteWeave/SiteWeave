import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

function extensionFromUri(uri, mimeType) {
  if (mimeType?.includes('png')) return 'png';
  if (mimeType?.includes('heic') || mimeType?.includes('heif')) return 'heic';
  if (mimeType?.includes('webp')) return 'webp';
  const match = String(uri).match(/\.([a-z0-9]+)(?:\?|$)/i);
  return match?.[1]?.toLowerCase() || 'jpg';
}

function yieldToUi() {
  return new Promise((resolve) => {
    if (typeof setImmediate === 'function') {
      setImmediate(resolve);
      return;
    }
    setTimeout(resolve, 0);
  });
}

function decodeBase64Chunk(base64) {
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(base64);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  for (let i = 0; i < base64.length; i += 4) {
    const enc1 = chars.indexOf(base64.charAt(i));
    const enc2 = chars.indexOf(base64.charAt(i + 1));
    const enc3 = chars.indexOf(base64.charAt(i + 2));
    const enc4 = chars.indexOf(base64.charAt(i + 3));
    output += String.fromCharCode((enc1 << 2) | (enc2 >> 4));
    if (enc3 !== 64) output += String.fromCharCode(((enc2 & 15) << 4) | (enc3 >> 2));
    if (enc4 !== 64) output += String.fromCharCode(((enc3 & 3) << 6) | enc4);
  }
  return output;
}

async function base64ToArrayBuffer(base64) {
  const normalized = base64.replace(/\s/g, '');
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  const expectedLength = Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
  const bytes = new Uint8Array(expectedLength);
  // Must remain divisible by four so each slice is independently valid base64.
  const chunkSize = 256 * 1024;
  let writeOffset = 0;

  for (let offset = 0; offset < normalized.length; offset += chunkSize) {
    const binary = decodeBase64Chunk(normalized.slice(offset, offset + chunkSize));
    for (let i = 0; i < binary.length; i += 1) {
      bytes[writeOffset + i] = binary.charCodeAt(i);
    }
    writeOffset += binary.length;
    if (offset + chunkSize < normalized.length) await yieldToUi();
  }

  return writeOffset === bytes.byteLength ? bytes.buffer : bytes.buffer.slice(0, writeOffset);
}

async function readUriAsArrayBuffer(uri) {
  try {
    const file = new File(uri);
    if (typeof file.arrayBuffer === 'function') {
      return await file.arrayBuffer();
    }
  } catch {
    // Fall through — some content:// / ph:// URIs need fetch or legacy base64.
  }

  try {
    const response = await fetch(uri);
    if (response && (response.ok || response.status === 0)) {
      return await response.arrayBuffer();
    }
  } catch {
    // Fall through to base64.
  }

  const base64 = await LegacyFileSystem.readAsStringAsync(uri, {
    encoding: LegacyFileSystem.EncodingType.Base64,
  });
  return base64ToArrayBuffer(base64);
}

/**
 * Read a local image URI into an upload payload for Supabase storage.
 * Prefer native binary reads — avoid sync multi-MB base64 decode on the JS thread.
 * React Native Blob does not support ArrayBufferView — pass ArrayBuffer to storage.upload.
 */
export async function uriToUploadPayload(uri, { mimeType = 'image/jpeg', fileName } = {}) {
  const type = mimeType || 'image/jpeg';
  const ext = extensionFromUri(uri, type);
  const name = fileName || `photo-${Date.now()}.${ext}`;
  const body = await readUriAsArrayBuffer(uri);

  return {
    body,
    type,
    name,
    size: body.byteLength,
  };
}

/** @deprecated Use uriToUploadPayload — kept for callers expecting the old name. */
export async function uriToUploadFile(uri, options) {
  return uriToUploadPayload(uri, options);
}
