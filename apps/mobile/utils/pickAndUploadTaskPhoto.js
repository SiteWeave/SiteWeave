import * as ImagePicker from 'expo-image-picker';
import { uploadTaskPhotoSet } from '@siteweave/core-logic';
import { uriToUploadPayload } from './imageUpload';
import { prepareTaskPhotoForUpload } from './prepareTaskPhoto';

const IMAGE_MEDIA_TYPES = ImagePicker.MediaType?.Images
  ? [ImagePicker.MediaType.Images]
  : (ImagePicker.MediaTypeOptions?.Images ?? ['images']);

/**
 * Pick from camera or library and attach a photo to a task.
 */
export async function pickAndUploadTaskPhoto({
  supabase,
  task,
  organizationId,
  userId,
  mode,
  isCompletionPhoto = false,
}) {
  if (!task?.id || !task?.project_id || !organizationId || !supabase) {
    throw new Error('Task photo upload is missing project or organization context.');
  }
  if (!userId) {
    throw new Error('You must be signed in to attach photos.');
  }

  const permission =
    mode === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo permission is required to attach task photos.');
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
  const prepared = await prepareTaskPhotoForUpload(asset.uri);
  const originalFile = await uriToUploadPayload(prepared.uri, {
    mimeType: prepared.mimeType,
    fileName: asset.fileName || undefined,
  });

  await uploadTaskPhotoSet(supabase, {
    taskId: task.id,
    organizationId,
    projectId: task.project_id,
    originalFile,
    thumbnailFile: null,
    uploadedByUserId: userId,
    capturedAt: new Date().toISOString(),
    isCompletionPhoto,
  });

  return true;
}

export function resolveTaskOrganizationId(task, activeOrganization, projects = []) {
  if (task?.organization_id) return task.organization_id;
  if (activeOrganization?.id) return activeOrganization.id;
  const project = projects.find((p) => p.id === task?.project_id);
  return project?.organization_id ?? null;
}
