import exifr from 'exifr';

function makeLocalId() {
  return globalThis.crypto?.randomUUID?.() || `task-photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Best-effort capture time from EXIF (DateTimeOriginal / CreateDate / ModifyDate).
 * GPS is not read; uploaded files are re-encoded client-side so location EXIF is not stored in the bucket.
 */
export async function extractExifCapturedAt(file) {
  if (!(file instanceof Blob)) return null;
  try {
    const tags = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'],
    });
    if (!tags) return null;
    const raw = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate;
    if (!raw) return null;
    const d = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function toFile(blob, fileName) {
  if (blob instanceof File) return blob;
  return new File([blob], fileName, {
    type: blob.type || 'image/jpeg',
    lastModified: Date.now(),
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not load image: ${file.name || 'photo'}`));
    };

    image.src = objectUrl;
  });
}

export function sortTaskPhotos(photos = []) {
  return [...photos].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });
}

export function buildTaskCompletionPhotoDetails(task) {
  const photos = Array.isArray(task?.task_photos) ? task.task_photos : [];
  const completionPhotos = photos.filter((photo) => photo.is_completion_photo);

  return {
    photo_count: photos.length,
    completion_photo_count: completionPhotos.length,
    completion_photo_ids: completionPhotos.map((photo) => photo.id).filter(Boolean),
  };
}

/**
 * Mirrors `public.can_manage_task` / task RLS: assignee, project PM, or org role name `Admin`.
 * For new tasks before insert, pass `assigneeContactId` (selected assignee) instead of `task`.
 */
export function canManageTaskPhotos({
  project,
  userId,
  userContactId,
  userRoleName,
  canEditTasks = false,
  task,
  assigneeContactId,
}) {
  if (!userId || !project) return false;
  if (canEditTasks) return true;
  if (project.project_manager_id && userId === project.project_manager_id) return true;
  if (userRoleName === 'Admin') return true;
  const assignee = task?.assignee_id ?? assigneeContactId ?? null;
  if (userContactId && assignee && userContactId === assignee) return true;
  return false;
}

export async function resizeTaskPhoto(file, {
  maxDimension,
  quality = 0.82,
  outputType = 'image/jpeg',
  fileName = 'photo.jpg',
}) {
  if (!(file instanceof Blob)) {
    throw new Error('Task photo must be a File or Blob');
  }

  const image = await loadImage(file);
  const largestSide = Math.max(image.width, image.height);
  const scale = largestSide > maxDimension ? maxDimension / largestSide : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is not available for image processing');
  }

  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error('Could not generate resized image'));
        return;
      }
      resolve(result);
    }, outputType, quality);
  });

  return toFile(blob, fileName);
}

export async function buildTaskPhotoDraft(file, index = 0) {
  const captured_at = await extractExifCapturedAt(file);

  const originalBaseName = (file?.name || 'task-photo')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .toLowerCase();

  const optimizedOriginal = await resizeTaskPhoto(file, {
    maxDimension: 1600,
    quality: 0.86,
    outputType: 'image/jpeg',
    fileName: `${originalBaseName || 'task-photo'}-full.jpg`,
  });

  const thumbnail = await resizeTaskPhoto(file, {
    maxDimension: 480,
    quality: 0.74,
    outputType: 'image/jpeg',
    fileName: `${originalBaseName || 'task-photo'}-thumb.jpg`,
  });

  return {
    local_id: makeLocalId(),
    originalFile: optimizedOriginal,
    thumbnailFile: thumbnail,
    caption: '',
    is_completion_photo: false,
    sort_order: index,
    preview_url: URL.createObjectURL(thumbnail),
    full_url: URL.createObjectURL(optimizedOriginal),
    original_filename: file?.name || optimizedOriginal.name,
    captured_at,
  };
}

export function revokeTaskPhotoDraftUrls(photos = []) {
  photos.forEach((photo) => {
    if (photo?.preview_url?.startsWith?.('blob:')) {
      URL.revokeObjectURL(photo.preview_url);
    }
    if (photo?.full_url?.startsWith?.('blob:')) {
      URL.revokeObjectURL(photo.full_url);
    }
  });
}
