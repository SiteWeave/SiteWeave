import { getStorageString, setStorageString, removeStorageKey } from './fastStorage';

const PREFIX = 'siteweave_draft_v1:';

function draftKey(scope, id) {
  return `${PREFIX}${scope}:${id || 'default'}`;
}

export async function loadFormDraft(scope, id = 'default') {
  try {
    const raw = await getStorageString(draftKey(scope, id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveFormDraft(scope, id = 'default', data) {
  try {
    await setStorageString(draftKey(scope, id), JSON.stringify({
      data,
      updatedAt: Date.now(),
    }));
  } catch {
    // ignore
  }
}

export async function clearFormDraft(scope, id = 'default') {
  try {
    await removeStorageKey(draftKey(scope, id));
  } catch {
    // ignore
  }
}
