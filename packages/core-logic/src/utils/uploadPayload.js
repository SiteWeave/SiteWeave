/**
 * Normalize web File/Blob or mobile { body: ArrayBuffer, type, name, size } for storage.upload.
 * @param {Blob | File | { body: ArrayBuffer, type?: string, name?: string, size?: number }} file
 */
export function resolveStorageUpload(file) {
  if (!file) {
    return { body: null, contentType: 'application/octet-stream', name: 'file', size: 0 };
  }

  if (file.body instanceof ArrayBuffer) {
    return {
      body: file.body,
      contentType: file.type || 'application/octet-stream',
      name: file.name || 'file',
      size: typeof file.size === 'number' ? file.size : file.body.byteLength,
    };
  }

  return {
    body: file,
    contentType: file.type || 'application/octet-stream',
    name: file.name || 'file',
    size: typeof file.size === 'number' ? file.size : null,
  };
}
