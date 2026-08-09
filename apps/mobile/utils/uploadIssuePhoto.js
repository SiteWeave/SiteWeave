import { uriToUploadPayload } from './imageUpload';
import { jpegFileName, preparePhotoForUpload } from './prepareTaskPhoto';
import { setIssueBeforePhotoPath, setIssueAfterPhotoPath } from '@siteweave/core-logic';
import { withOneRetry } from './withOneRetry';

async function payloadFromLocalUri(uri, fileName) {
  const prepared = await preparePhotoForUpload(uri);
  return uriToUploadPayload(prepared.uri, {
    mimeType: prepared.mimeType,
    fileName: jpegFileName(fileName),
  });
}

export async function uploadIssuePhotoFromUri(
  supabase,
  { issueId, uri, userId, organizationId, fileName },
) {
  if (!issueId || !uri || !userId || !organizationId) {
    throw new Error('Missing issue photo upload context');
  }

  const payload = await payloadFromLocalUri(uri, fileName);
  const safeName = (payload.name || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `field-issues/${issueId}/${Date.now()}_${safeName}`;

  await withOneRetry(async () => {
    const { error: uploadError } = await supabase.storage.from('message_files').upload(path, payload.body, {
      cacheControl: '3600',
      upsert: true,
      contentType: payload.type || 'image/jpeg',
    });
    if (uploadError) throw uploadError;
  });

  const { data: urlData } = supabase.storage.from('message_files').getPublicUrl(path);

  const { data, error } = await supabase
    .from('issue_files')
    .insert({
      issue_id: issueId,
      organization_id: organizationId,
      file_name: safeName,
      file_url: urlData.publicUrl,
      file_type: payload.type || 'image/jpeg',
      file_size_kb: Math.ceil((payload.size || 0) / 1024) || 1,
      uploaded_by_user_id: userId,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function uploadIssueBeforePhotoFromUri(
  supabase,
  { issueId, uri, userId, organizationId, fileName },
) {
  if (!issueId || !uri) throw new Error('Missing before photo upload context');
  const payload = await payloadFromLocalUri(uri, fileName);
  const safeName = (payload.name || 'before.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `field-issues/${issueId}/before_${Date.now()}_${safeName}`;

  await withOneRetry(async () => {
    const { error: uploadError } = await supabase.storage.from('message_files').upload(path, payload.body, {
      cacheControl: '3600',
      upsert: true,
      contentType: payload.type || 'image/jpeg',
    });
    if (uploadError) throw uploadError;
  });

  await setIssueBeforePhotoPath(supabase, issueId, path);
  const { data: urlData } = supabase.storage.from('message_files').getPublicUrl(path);
  return { path, publicUrl: urlData.publicUrl };
}

export async function uploadIssueAfterPhotoFromUri(
  supabase,
  { issueId, uri, userId, organizationId, fileName },
) {
  if (!issueId || !uri) throw new Error('Missing after photo upload context');
  const payload = await payloadFromLocalUri(uri, fileName);
  const safeName = (payload.name || 'after.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `field-issues/${issueId}/after_${Date.now()}_${safeName}`;

  await withOneRetry(async () => {
    const { error: uploadError } = await supabase.storage.from('message_files').upload(path, payload.body, {
      cacheControl: '3600',
      upsert: true,
      contentType: payload.type || 'image/jpeg',
    });
    if (uploadError) throw uploadError;
  });

  await setIssueAfterPhotoPath(supabase, issueId, path);
  const { data: urlData } = supabase.storage.from('message_files').getPublicUrl(path);
  return { path, publicUrl: urlData.publicUrl };
}
