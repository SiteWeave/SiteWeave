/**
 * Helpers for merging Supabase Realtime postgres_changes into local lists.
 */

/**
 * @param {Array<{ id: string }>} list
 * @param {{ id: string }} item
 * @param {'prepend'|'append'} position
 */
export function upsertById(list, item, position = 'prepend') {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = { ...next[idx], ...item };
    return next;
  }
  return position === 'append' ? [...list, item] : [item, ...list];
}

/**
 * @param {Array<{ id: string }>} list
 * @param {string} id
 */
export function removeById(list, id) {
  return list.filter((x) => x.id !== id);
}

/**
 * @param {import('@supabase/supabase-js').RealtimePostgresChangesPayload} payload
 */
export function getRealtimeRow(payload) {
  return {
    eventType: payload.eventType,
    newRow: payload.new,
    oldRow: payload.old,
  };
}
