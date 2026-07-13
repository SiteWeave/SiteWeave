import { Directory, File, Paths } from 'expo-file-system';

const OFFLINE_PHOTO_DIR = new Directory(Paths.cache, 'offline-photos');

function ensureOfflinePhotoDir() {
  if (!OFFLINE_PHOTO_DIR.exists) {
    OFFLINE_PHOTO_DIR.create({ intermediates: true });
  }
}

export async function persistOfflinePhotoUri(uri) {
  ensureOfflinePhotoDir();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const dest = new File(OFFLINE_PHOTO_DIR, filename);
  await new File(uri).copy(dest);
  return dest.uri;
}

export async function removeOfflinePhoto(uri) {
  if (!uri?.startsWith(OFFLINE_PHOTO_DIR.uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // ignore cleanup errors
  }
}
