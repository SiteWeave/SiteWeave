const STORAGE_KEY = 'siteweave_stream_last_read';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function markStreamRead(projectId) {
  if (!projectId) return;
  const all = readAll();
  all[projectId] = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getStreamLastReadAt(projectId) {
  if (!projectId) return null;
  return readAll()[projectId] || null;
}
