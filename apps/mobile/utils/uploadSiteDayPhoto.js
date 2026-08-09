import { uriToUploadPayload } from './imageUpload';
import { jpegFileName, preparePhotoForUpload } from './prepareTaskPhoto';
import { withOneRetry } from './withOneRetry';

export async function uploadSiteDayPhotoFromUri(supabase, { projectId, uri, fileName }) {
  if (!projectId || !uri) throw new Error('Missing site day photo upload context');

  const prepared = await preparePhotoForUpload(uri);
  const payload = await uriToUploadPayload(prepared.uri, {
    mimeType: prepared.mimeType,
    fileName: jpegFileName(fileName),
  });
  const safeName = (payload.name || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `stream/${projectId}/site-day/${Date.now()}_${safeName}`;

  await withOneRetry(async () => {
    const { error: uploadError } = await supabase.storage.from('message_files').upload(path, payload.body, {
      cacheControl: '3600',
      upsert: true,
      contentType: payload.type || 'image/jpeg',
    });
    if (uploadError) throw uploadError;
  });

  const { data: urlData } = supabase.storage.from('message_files').getPublicUrl(path);

  return {
    url: urlData.publicUrl,
    caption: '',
    file_name: safeName,
  };
}
