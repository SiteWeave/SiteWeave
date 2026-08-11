import { uploadTaskPhotoSet } from '@siteweave/core-logic';
import { uriToUploadPayload } from './imageUpload';
import { jpegFileName, prepareTaskPhotoForUpload } from './prepareTaskPhoto';
import { pickPhotos } from './pickPhotos';
import { withOneRetry } from './withOneRetry';

/**
 * Pick from camera or library and attach one or more photos to a task.
 * Library supports multi-select; camera can take several shots in a row.
 * Callers must dismiss any RN Modal before invoking this — native pickers stacked
 * over Modals hang on some iOS/Android devices.
 *
 * @param {object} options
 * @param {(uri: string, meta?: { index: number, total: number }) => void} [options.onLocalReady]
 * @param {() => void} [options.onAssetSelected]
 * @param {(key: string, opts?: object) => string} [options.t]
 */
export async function pickAndUploadTaskPhoto({
  supabase,
  task,
  organizationId,
  userId,
  mode,
  isCompletionPhoto = false,
  onLocalReady,
  onAssetSelected,
  t = (key, opts) => opts?.defaultValue || key,
}) {
  if (!task?.id || !task?.project_id || !organizationId || !supabase) {
    throw new Error('Task photo upload is missing project or organization context.');
  }
  if (!userId) {
    throw new Error('You must be signed in to attach photos.');
  }

  let assets;
  try {
    assets = await pickPhotos({ mode, t });
  } catch (error) {
    if (error?.code === 'CAMERA_PERMISSION_DENIED') {
      throw new Error('Camera permission is required to take task photos.');
    }
    throw error;
  }

  if (!assets.length) return null;

  onAssetSelected?.();

  const uploaded = [];
  let lastError = null;
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    onLocalReady?.(asset.uri, { index, total: assets.length });

    try {
      const prepared = await prepareTaskPhotoForUpload(asset.uri);
      const originalFile = await uriToUploadPayload(prepared.uri, {
        mimeType: prepared.mimeType,
        fileName: jpegFileName(asset.fileName),
      });

      await withOneRetry(() =>
        uploadTaskPhotoSet(supabase, {
          taskId: task.id,
          organizationId,
          projectId: task.project_id,
          originalFile,
          thumbnailFile: null,
          uploadedByUserId: userId,
          capturedAt: new Date().toISOString(),
          isCompletionPhoto,
        }),
      );

      uploaded.push({ localUri: asset.uri, uploaded: true });
    } catch (error) {
      lastError = error;
      console.error('Task photo upload failed:', error);
    }
  }

  if (!uploaded.length) {
    throw lastError || new Error('Could not upload photos.');
  }

  return {
    localUri: uploaded[uploaded.length - 1]?.localUri || assets[0].uri,
    count: uploaded.length,
    failedCount: assets.length - uploaded.length,
    uploaded: true,
    items: uploaded,
  };
}

/**
 * Re-upload an already-picked local URI (Retry path).
 */
export async function uploadTaskPhotoFromUri({
  supabase,
  task,
  organizationId,
  userId,
  localUri,
  fileName,
  isCompletionPhoto = false,
}) {
  if (!task?.id || !task?.project_id || !organizationId || !supabase || !localUri) {
    throw new Error('Task photo upload is missing project or organization context.');
  }
  if (!userId) {
    throw new Error('You must be signed in to attach photos.');
  }

  const prepared = await prepareTaskPhotoForUpload(localUri);
  const originalFile = await uriToUploadPayload(prepared.uri, {
    mimeType: prepared.mimeType,
    fileName: jpegFileName(fileName),
  });

  await withOneRetry(() =>
    uploadTaskPhotoSet(supabase, {
      taskId: task.id,
      organizationId,
      projectId: task.project_id,
      originalFile,
      thumbnailFile: null,
      uploadedByUserId: userId,
      capturedAt: new Date().toISOString(),
      isCompletionPhoto,
    }),
  );

  return true;
}

export function resolveTaskOrganizationId(task, activeOrganization, projects = []) {
  if (task?.organization_id) return task.organization_id;
  if (activeOrganization?.id) return activeOrganization.id;
  const project = projects.find((p) => p.id === task?.project_id);
  return project?.organization_id ?? null;
}
