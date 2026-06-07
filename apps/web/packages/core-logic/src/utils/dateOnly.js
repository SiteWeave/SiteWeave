/**
 * Date-only (YYYY-MM-DD) helpers — always interpret and display in local calendar time.
 * Avoid `new Date('YYYY-MM-DD')` / UTC midnight, which shifts the day in US timezones.
 */

/**
 * @param {string|null|undefined} iso
 * @returns {Date|null} local midnight for that calendar day
 */
export function parseLocalDateOnly(iso) {
  if (!iso) return null;
  const datePart = String(iso).trim().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) return null;
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(y, mo - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * @param {Date} [d]
 * @returns {string} YYYY-MM-DD in local calendar
 */
export function localDateOnlyIso(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @param {string} iso YYYY-MM-DD
 * @param {number} days
 * @returns {string|null}
 */
export function addDaysToDateOnly(iso, days) {
  const dt = parseLocalDateOnly(iso);
  if (!dt || !Number.isFinite(days)) return null;
  dt.setDate(dt.getDate() + days);
  return localDateOnlyIso(dt);
}

/**
 * @param {string|null|undefined} iso
 * @param {string} [locale]
 * @param {{ month?: string, year?: string|number }} [options]
 */
export function formatLocalDateOnly(iso, locale = undefined, options = {}) {
  const dt = parseLocalDateOnly(iso);
  if (!dt) return '';
  const fmt = {
    month: options.month ?? 'short',
    day: 'numeric',
  };
  if (options.year) fmt.year = options.year;
  return dt.toLocaleDateString(locale, fmt);
}

/**
 * @param {string|null|undefined} start
 * @param {string|null|undefined} end
 * @param {string} [locale]
 */
export function formatLocalDateRange(start, end, locale = undefined) {
  if (!start && !end) return null;
  if (start && end) {
    if (start === end) return formatLocalDateOnly(start, locale);
    return `${formatLocalDateOnly(start, locale)} – ${formatLocalDateOnly(end, locale)}`;
  }
  return formatLocalDateOnly(start || end, locale);
}

/**
 * Calendar-day difference between two date-only ISO strings (end − start).
 * @returns {number|null}
 */
export function daysBetweenDateOnly(startIso, endIso) {
  const start = parseLocalDateOnly(startIso);
  const end = parseLocalDateOnly(endIso);
  if (!start || !end) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / msPerDay);
}

/** @param {string|null|undefined} value */
export function isDateOnlyString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim().slice(0, 10));
}

/**
 * Format a value for display: date-only strings use local calendar; datetimes use local instant.
 * @param {string|null|undefined} value
 * @param {string} [locale]
 * @param {{ month?: string, year?: string|number }} [options]
 */
export function formatDateForDisplay(value, locale = undefined, options = {}) {
  if (!value) return '';
  if (isDateOnlyString(value)) {
    return formatLocalDateOnly(value, locale, options);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const fmt = {
    month: options.month ?? 'short',
    day: 'numeric',
  };
  if (options.year) fmt.year = options.year;
  return parsed.toLocaleDateString(locale, fmt);
}
