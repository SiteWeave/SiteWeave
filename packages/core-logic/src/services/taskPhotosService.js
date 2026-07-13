import { createSignedFileUrl } from './fileService.js';
import { resolveStorageUpload } from '../utils/uploadPayload.js';

export const TASK_PHOTOS_BUCKET = 'task_photos';

function fallbackUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.random() * 16 | 0;
    const value = character === 'x' ? random : (random & 0x3 | 0x8);
    return value.toString(16);
  });
}

function makeUuid() {
  return globalThis.crypto?.randomUUID?.() || fallbackUuid();
}

export function sanitizeTaskPhotoFileName(fileName = 'photo.jpg') {
  return String(fileName)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'photo.jpg';
}

export function buildTaskPhotoPaths({ organizationId, projectId, taskId, photoId, fileName }) {
  const safeName = sanitizeTaskPhotoFileName(fileName);
  const extension = safeName.includes('.') ? safeName.split('.').pop() : 'jpg';
  const baseName = `${photoId}-${Date.now()}`;

  return {
    originalPath: `${organizationId}/${projectId}/${taskId}/original/${baseName}.${extension}`,
    thumbnailPath: `${organizationId}/${projectId}/${taskId}/thumb/${baseName}.jpg`,
  };
}

export async function fetchTaskPhotos(supabase, taskId) {
  const { data, error } = await supabase
    .from('task_photos')
    .select('*')
    .eq('task_id', taskId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function attachTaskPhotoUrls(supabase, photos, expiresIn = 3600) {
  return Promise.all((photos || []).map(async (photo) => {
    try {
      const bucket = photo.storage_bucket || TASK_PHOTOS_BUCKET;
      const [fullUrl, thumbnailUrl] = await Promise.all([
        createSignedFileUrl(supabase, bucket, photo.storage_path, expiresIn),
        createSignedFileUrl(supabase, bucket, photo.thumbnail_path || photo.storage_path, expiresIn),
      ]);

      return {
        ...photo,
        full_url: fullUrl,
        thumbnail_url: thumbnailUrl,
      };
    } catch {
      return {
        ...photo,
        full_url: null,
        thumbnail_url: null,
      };
    }
  }));
}

export async function uploadTaskPhotoSet(supabase, {
  taskId,
  organizationId,
  projectId,
  originalFile,
  thumbnailFile,
  caption = null,
  isCompletionPhoto = false,
  uploadedByUserId = null,
  sortOrder = 0,
  capturedAt = null,
}) {
  const photoId = makeUuid();
  const { originalPath, thumbnailPath } = buildTaskPhotoPaths({
    organizationId,
    projectId,
    taskId,
    photoId,
    fileName: originalFile?.name,
  });

  const storage = supabase.storage.from(TASK_PHOTOS_BUCKET);

  const originalUpload = resolveStorageUpload(originalFile);
  const { error: originalError } = await storage.upload(originalPath, originalUpload.body, {
    cacheControl: '3600',
    upsert: false,
    contentType: originalUpload.contentType || 'image/jpeg',
  });
  if (originalError) throw originalError;

  let uploadedThumbPath = null;
  try {
    if (thumbnailFile) {
      const thumbUpload = resolveStorageUpload(thumbnailFile);
      const { error: thumbError } = await storage.upload(thumbnailPath, thumbUpload.body, {
        cacheControl: '3600',
        upsert: false,
        contentType: thumbUpload.contentType || 'image/jpeg',
      });
      if (thumbError) throw thumbError;
      uploadedThumbPath = thumbnailPath;
    }

    const { data, error } = await supabase
      .from('task_photos')
      .insert({
        id: photoId,
        task_id: taskId,
        storage_bucket: TASK_PHOTOS_BUCKET,
        storage_path: originalPath,
        thumbnail_path: uploadedThumbPath,
        caption,
        sort_order: sortOrder,
        is_completion_photo: Boolean(isCompletionPhoto),
        uploaded_by_user_id: uploadedByUserId,
        mime_type: originalUpload.contentType || null,
        original_filename: originalUpload.name || null,
        file_size_bytes: originalUpload.size || null,
        captured_at: capturedAt || null,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    const pathsToRemove = [originalPath, uploadedThumbPath].filter(Boolean);
    if (pathsToRemove.length > 0) {
      await storage.remove(pathsToRemove);
    }
    throw error;
  }
}

export async function updateTaskPhoto(supabase, photoId, updates) {
  const { data, error } = await supabase
    .from('task_photos')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', photoId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function reorderTaskPhotos(supabase, taskId, orderedPhotoIds) {
  const results = await Promise.all((orderedPhotoIds || []).map((photoId, index) =>
    supabase
      .from('task_photos')
      .update({
        sort_order: index,
        updated_at: new Date().toISOString(),
      })
      .eq('task_id', taskId)
      .eq('id', photoId)
  ));

  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;

  return fetchTaskPhotos(supabase, taskId);
}

export async function deleteTaskPhoto(supabase, photo) {
  const bucket = photo?.storage_bucket || TASK_PHOTOS_BUCKET;
  const paths = [photo?.storage_path, photo?.thumbnail_path].filter(Boolean);

  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from(bucket).remove(paths);
    if (storageError) throw storageError;
  }

  const { error } = await supabase
    .from('task_photos')
    .delete()
    .eq('id', photo.id);

  if (error) throw error;
}
