import { attachTaskPhotoUrls } from './taskPhotosService.js';

function pickTimestamp(row) {
  return row.captured_at || row.created_at || row.log_date || null;
}

/**
 * Aggregate project photos from task_photos, site day stream posts, and issue files.
 */
export async function fetchProjectPhotoRoll(supabase, projectId, { limit = 100 } = {}) {
  if (!projectId) return [];

  const { data: projectTasks, error: taskErr } = await supabase
    .from('tasks')
    .select('id, text, project_phase_id')
    .eq('project_id', projectId);
  if (taskErr) throw taskErr;
  const taskIds = (projectTasks || []).map((t) => t.id);
  const taskMap = new Map((projectTasks || []).map((t) => [t.id, t]));

  const items = [];

  if (taskIds.length) {
    const { data: taskPhotos, error: photoErr } = await supabase
      .from('task_photos')
      .select('*')
      .in('task_id', taskIds)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (photoErr) throw photoErr;
    const withUrls = await attachTaskPhotoUrls(supabase, taskPhotos || []);
    for (const photo of withUrls) {
      const task = taskMap.get(photo.task_id);
      items.push({
        id: `task-photo-${photo.id}`,
        source: 'task',
        task_id: photo.task_id,
        task_title: task?.text || null,
        phase_id: task?.project_phase_id || null,
        caption: photo.caption,
        is_completion_photo: photo.is_completion_photo,
        thumbnail_url: photo.thumbnail_url,
        full_url: photo.full_url,
        captured_at: pickTimestamp(photo),
      });
    }
  }

  const { data: dailyLogs, error: logErr } = await supabase
    .from('project_stream_posts')
    .select('id, title, payload, created_at, author_id')
    .eq('project_id', projectId)
    .eq('post_type', 'daily_log')
    .order('created_at', { ascending: false })
    .limit(50);
  if (logErr) throw logErr;

  for (const post of dailyLogs || []) {
    const payload = post.payload || {};
    const logDate = payload.log_date || post.created_at;
    const photos = Array.isArray(payload.photos) ? payload.photos : [];
    photos.forEach((photo, index) => {
      if (!photo?.url) return;
      items.push({
        id: `site-day-${post.id}-${index}`,
        source: 'site_day',
        stream_post_id: post.id,
        task_id: null,
        task_title: post.title || null,
        phase_id: null,
        caption: null,
        is_completion_photo: false,
        thumbnail_url: photo.url,
        full_url: photo.url,
        captured_at: logDate,
      });
    });
  }

  const { data: issues, error: issueErr } = await supabase
    .from('project_issues')
    .select('id, title, status')
    .eq('project_id', projectId);
  if (issueErr) throw issueErr;
  const issueIds = (issues || []).map((i) => i.id);
  const issueMap = new Map((issues || []).map((i) => [i.id, i]));

  if (issueIds.length) {
    const { data: issueFiles, error: fileErr } = await supabase
      .from('issue_files')
      .select('*')
      .in('issue_id', issueIds)
      .order('uploaded_at', { ascending: false });
    if (fileErr) throw fileErr;

    for (const file of issueFiles || []) {
      const url = file.file_url || null;
      if (!url) continue;
      const issue = issueMap.get(file.issue_id);
      items.push({
        id: `issue-file-${file.id}`,
        source: 'issue',
        issue_id: file.issue_id,
        task_id: null,
        task_title: issue?.title || null,
        phase_id: null,
        caption: file.file_name || null,
        is_completion_photo: false,
        thumbnail_url: url,
        full_url: url,
        captured_at: file.uploaded_at || file.created_at,
      });
    }
  }

  items.sort((a, b) => {
    const ta = new Date(a.captured_at || 0).getTime();
    const tb = new Date(b.captured_at || 0).getTime();
    return tb - ta;
  });

  return items.slice(0, limit);
}
