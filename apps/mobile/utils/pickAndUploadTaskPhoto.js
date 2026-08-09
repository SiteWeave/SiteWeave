import * as ImagePicker from 'expo-image-picker';
import { uploadTaskPhotoSet } from '@siteweave/core-logic';
import { uriToUploadPayload } from './imageUpload';
import { jpegFileName, prepareTaskPhotoForUpload } from './prepareTaskPhoto';
import { IMAGE_MEDIA_TYPES } from './imagePickerMediaTypes';
import { withOneRetry } from './withOneRetry';

/**
 * Pick from camera or library and attach a photo to a task.
 * Callers must dismiss any RN Modal before invoking this — native pickers stacked
 * over Modals hang on some iOS/Android devices.
 *
 * @param {object} options
 * @param {(uri: string) => void} [options.onLocalReady] - Fired as soon as a local URI exists (before upload).
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
}) {
  if (!task?.id || !task?.project_id || !organizationId || !supabase) {
    throw new Error('Task photo upload is missing project or organization context.');
  }
  if (!userId) {
    throw new Error('You must be signed in to attach photos.');
  }

  if (mode === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera permission is required to take task photos.');
    }
  }

  const result =
    mode === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: IMAGE_MEDIA_TYPES,
          quality: 0.8,
          allowsEditing: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: IMAGE_MEDIA_TYPES,
          quality: 0.8,
          allowsEditing: false,
        });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  onLocalReady?.(asset.uri);
  onAssetSelected?.();

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

  return { localUri: asset.uri, uploaded: true };
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
