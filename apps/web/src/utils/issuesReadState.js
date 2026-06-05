const STORAGE_KEY = 'siteweave_issues_last_read';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function markIssuesRead(projectId) {
  if (!projectId) return;
  const all = readAll();
  all[projectId] = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getIssuesLastReadAt(projectId) {
  if (!projectId) return null;
  return readAll()[projectId] || null;
}

export function markCollaborationRead(projectId) {
  markIssuesRead(projectId);
  try {
    const { markStreamRead } = require('./streamReadState');
    markStreamRead(projectId);
  } catch {
    // streamReadState imported by callers
  }
}
