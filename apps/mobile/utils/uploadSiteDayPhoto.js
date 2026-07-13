import { uriToUploadPayload } from './imageUpload';

export async function uploadSiteDayPhotoFromUri(supabase, { projectId, uri, fileName }) {
  if (!projectId || !uri) throw new Error('Missing site day photo upload context');

  const payload = await uriToUploadPayload(uri, { fileName });
  const safeName = (fileName || payload.name || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `stream/${projectId}/site-day/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage.from('message_files').upload(path, payload.body, {
    cacheControl: '3600',
    upsert: false,
    contentType: payload.type || 'image/jpeg',
  });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('message_files').getPublicUrl(path);

  return {
    url: urlData.publicUrl,
    caption: '',
    file_name: safeName,
  };
}
