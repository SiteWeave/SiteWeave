export const PROFILE_PHOTOS_BUCKET = 'profile_photos';
export const PROFILE_PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const PROFILE_PHOTO_SIZE = 512;

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

function sanitizeExtension(type = '') {
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  return 'jpg';
}

function parseProfilePhotoPathFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const marker = `/storage/v1/object/public/${PROFILE_PHOTOS_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).replace(/[?#].*$/, '');
}

function buildProfilePhotoPath(userId, contactId, contentType = 'image/jpeg') {
  const ext = sanitizeExtension(contentType);
  return `${userId}/${contactId}/v${Date.now()}-${makeUuid()}.${ext}`;
}

async function ensureUserContactLinked(supabase, userId) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, organization_id, contact_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (profile?.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, avatar_url')
      .eq('id', profile.contact_id)
      .maybeSingle();
    return {
      contactId: profile.contact_id,
      avatarUrl: contact?.avatar_url || null,
    };
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Not authenticated.');

  if (user.email) {
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id, avatar_url')
      .ilike('email', user.email)
      .maybeSingle();

    if (existingContact?.id) {
      await supabase
        .from('profiles')
        .update({ contact_id: existingContact.id })
        .eq('id', userId);
      return {
        contactId: existingContact.id,
        avatarUrl: existingContact.avatar_url || null,
      };
    }
  }

  const { data: newContact, error: createError } = await supabase
    .from('contacts')
    .insert({
      name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      email: user.email,
      type: 'Team',
      role: 'Team Member',
      status: 'Available',
      created_by_user_id: userId,
      organization_id: profile?.organization_id || null,
    })
    .select('id')
    .single();

  if (createError) throw createError;

  await supabase
    .from('profiles')
    .update({ contact_id: newContact.id })
    .eq('id', userId);

  return { contactId: newContact.id, avatarUrl: null };
}

export async function getCurrentUserContactProfile(supabase, userId, { ensureLinked = false } = {}) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('contact_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!profile?.contact_id) {
    if (ensureLinked) return ensureUserContactLinked(supabase, userId);
    throw new Error('No linked contact found for current user.');
  }

  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, avatar_url')
    .eq('id', profile.contact_id)
    .maybeSingle();

  if (contactError) throw contactError;

  return {
    contactId: profile.contact_id,
    avatarUrl: contact?.avatar_url || null,
  };
}

export async function resolveUserAvatarUrl(supabase, userId) {
  try {
    const { avatarUrl } = await getCurrentUserContactProfile(supabase, userId);
    return avatarUrl;
  } catch {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.user_metadata?.avatar_url || null;
  }
}

/**
 * Refresh contacts + profileAvatarUrl in client app state after upload/remove.
 * @returns {Promise<string|null>} canonical avatar URL
 */
export async function syncProfileAvatarToAppState(
  supabase,
  { userId, dispatch, contacts = [], userContactId = null },
) {
  if (!userId || !dispatch) return null;

  let contactId = userContactId;
  let avatar_url = await resolveUserAvatarUrl(supabase, userId);

  if (!contactId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('contact_id')
      .eq('id', userId)
      .maybeSingle();
    contactId = profile?.contact_id || null;
    if (contactId) {
      dispatch({ type: 'SET_USER_CONTACT_ID', payload: contactId });
    }
  }

  if (contactId) {
    dispatch({
      type: 'UPDATE_CONTACT',
      payload: {
        ...(contacts?.find((entry) => entry.id === contactId) || {}),
        id: contactId,
        avatar_url,
      },
    });
  }

  dispatch({ type: 'SET_PROFILE_AVATAR_URL', payload: avatar_url });
  return avatar_url;
}

export async function prepareWebAvatarFile(file, { outputSize = PROFILE_PHOTO_SIZE } = {}) {
  if (!file) throw new Error('No file selected.');
  if (typeof window === 'undefined' || typeof document === 'undefined') return file;

  const srcUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to read selected image.'));
      image.src = srcUrl;
    });

    const min = Math.min(img.width, img.height);
    const sx = Math.floor((img.width - min) / 2);
    const sy = Math.floor((img.height - min) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to process selected image.');

    ctx.drawImage(img, sx, sy, min, min, 0, 0, outputSize, outputSize);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob) throw new Error('Unable to process selected image.');
    return new File([blob], `avatar-${Date.now()}.webp`, { type: 'image/webp' });
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}

export function validateProfilePhotoFile(file) {
  if (!file) throw new Error('No file selected.');
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    throw new Error('Please upload a JPG, PNG, or WebP image.');
  }
  if (typeof file.size === 'number' && file.size > PROFILE_PHOTO_MAX_BYTES) {
    throw new Error('Image must be 3MB or smaller.');
  }
}

export async function uploadProfilePhoto(supabase, { userId, file }) {
  validateProfilePhotoFile(file);
  const { contactId, avatarUrl: previousAvatarUrl } = await getCurrentUserContactProfile(supabase, userId, {
    ensureLinked: true,
  });
  const path = buildProfilePhotoPath(userId, contactId, file.type);

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .upload(path, file, {
      cacheControl: '31536000',
      upsert: false,
      contentType: file.type || 'image/jpeg',
    });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from(PROFILE_PHOTOS_BUCKET).getPublicUrl(path);
  const publicUrl = urlData?.publicUrl || null;
  if (!publicUrl) throw new Error('Failed to create avatar URL.');

  const { error: updateError } = await supabase
    .from('contacts')
    .update({ avatar_url: publicUrl })
    .eq('id', contactId);
  if (updateError) {
    await supabase.storage.from(PROFILE_PHOTOS_BUCKET).remove([path]);
    throw updateError;
  }

  const oldPath = parseProfilePhotoPathFromUrl(previousAvatarUrl);
  if (oldPath && oldPath !== path) {
    await supabase.storage.from(PROFILE_PHOTOS_BUCKET).remove([oldPath]);
  }

  try {
    await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
  } catch {
    // Contacts avatar is source-of-truth; metadata update is best-effort.
  }

  return publicUrl;
}

export async function removeProfilePhoto(supabase, { userId }) {
  const { contactId, avatarUrl } = await getCurrentUserContactProfile(supabase, userId, {
    ensureLinked: true,
  });
  const oldPath = parseProfilePhotoPathFromUrl(avatarUrl);

  const { error: updateError } = await supabase
    .from('contacts')
    .update({ avatar_url: null })
    .eq('id', contactId);
  if (updateError) throw updateError;

  if (oldPath) {
    await supabase.storage.from(PROFILE_PHOTOS_BUCKET).remove([oldPath]);
  }

  try {
    await supabase.auth.updateUser({ data: { avatar_url: null } });
  } catch {
    // Best-effort only.
  }
}
