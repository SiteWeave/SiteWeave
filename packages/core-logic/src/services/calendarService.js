/**
 * Calendar Service
 * Handles all calendar event-related database operations
 */

/** Columns for calendar list views. */
export const CALENDAR_LIST_COLUMNS = [
  'id',
  'title',
  'description',
  'start_time',
  'end_time',
  'is_all_day',
  'project_id',
  'organization_id',
  'location',
  'category',
  'color',
  'recurrence',
  'user_id',
  'attendees',
].join(',');

/**
 * Default load window: previous month through end of next month (3-month span).
 * @param {Date} [referenceDate]
 * @returns {{ start: Date, end: Date }}
 */
export function getCalendarLoadRange(referenceDate = new Date()) {
  const ref = new Date(referenceDate);
  const start = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 2, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Whether a date falls within an already-loaded calendar window.
 * @param {Date} referenceDate
 * @param {{ start: Date, end: Date }} loadedRange
 */
export function isDateInCalendarLoadRange(referenceDate, loadedRange) {
  if (!loadedRange?.start || !loadedRange?.end) return false;
  const ref = new Date(referenceDate);
  return ref >= loadedRange.start && ref <= loadedRange.end;
}

/**
 * Fetch calendar events for the default load window (prefer over unbounded fetch).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Date} [referenceDate]
 * @returns {Promise<Array>}
 */
export async function fetchCalendarEvents(supabase, referenceDate = new Date()) {
  const { start, end } = getCalendarLoadRange(referenceDate);
  return fetchEventsByDateRange(supabase, start, end);
}

/**
 * Fetch today's calendar events
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @returns {Promise<Array>} Array of today's events
 */
export async function fetchTodayEvents(supabase) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const { data, error } = await supabase
    .from('calendar_events')
    .select(CALENDAR_LIST_COLUMNS)
    .gte('start_time', today.toISOString())
    .lt('start_time', tomorrow.toISOString())
    .order('start_time', { ascending: true });
  
  if (error) throw error;
  return data || [];
}

/**
 * Fetch calendar events for a specific date range
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Array of calendar events
 */
export async function fetchEventsByDateRange(supabase, startDate, endDate) {
  const { data, error } = await supabase
    .from('calendar_events')
    .select(CALENDAR_LIST_COLUMNS)
    .gte('start_time', startDate.toISOString())
    .lte('start_time', endDate.toISOString())
    .order('start_time', { ascending: true });
  
  if (error) throw error;
  return data || [];
}

/**
 * Create a calendar event
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Object} eventData - Event data
 * @returns {Promise<Object>} Created event
 */
export async function createCalendarEvent(supabase, eventData) {
  const { data, error } = await supabase
    .from('calendar_events')
    .insert(eventData)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Fetch calendar events for a specific date
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Date} date - Date to fetch events for
 * @returns {Promise<Array>} Array of calendar events for that date
 */
export async function fetchEventsByDate(supabase, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const { data, error } = await supabase
    .from('calendar_events')
    .select(CALENDAR_LIST_COLUMNS)
    .gte('start_time', startOfDay.toISOString())
    .lte('start_time', endOfDay.toISOString())
    .order('start_time', { ascending: true });
  
  if (error) throw error;
  return data || [];
}
