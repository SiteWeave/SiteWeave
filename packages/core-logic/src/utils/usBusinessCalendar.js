/**
 * US business days: Monday–Friday, excluding US federal holidays (observed dates).
 * Date strings are YYYY-MM-DD; iteration uses UTC midnight to match stored project dates.
 */

export function toIsoDateUtc(date) {
  return date.toISOString().slice(0, 10);
}

function nthWeekdayOfMonthUtc(year, monthIndex, weekday, nth) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, monthIndex, 1 + shift + (nth - 1) * 7));
}

function lastWeekdayOfMonthUtc(year, monthIndex, weekday) {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  const shift = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, monthIndex, last.getUTCDate() - shift));
}

function observedFixedHolidayUtc(year, monthIndex, day) {
  const d = new Date(Date.UTC(year, monthIndex, day));
  const dow = d.getUTCDay();
  if (dow === 6) return new Date(Date.UTC(year, monthIndex, day - 1));
  if (dow === 0) return new Date(Date.UTC(year, monthIndex, day + 1));
  return d;
}

function usFederalHolidaySetForYear(year) {
  const dates = [
    observedFixedHolidayUtc(year, 0, 1),
    nthWeekdayOfMonthUtc(year, 0, 1, 3),
    nthWeekdayOfMonthUtc(year, 1, 1, 3),
    lastWeekdayOfMonthUtc(year, 4, 1),
    observedFixedHolidayUtc(year, 5, 19),
    observedFixedHolidayUtc(year, 6, 4),
    nthWeekdayOfMonthUtc(year, 8, 1, 1),
    nthWeekdayOfMonthUtc(year, 9, 1, 2),
    observedFixedHolidayUtc(year, 10, 11),
    nthWeekdayOfMonthUtc(year, 10, 4, 4),
    observedFixedHolidayUtc(year, 11, 25),
  ];
  return new Set(dates.map(toIsoDateUtc));
}

export function buildFederalHolidayMap(startDate, endDateExclusive) {
  const startYear = startDate.getUTCFullYear() - 1;
  const endYear = endDateExclusive.getUTCFullYear() + 1;
  const all = new Set();
  for (let year = startYear; year <= endYear; year += 1) {
    for (const iso of usFederalHolidaySetForYear(year)) {
      all.add(iso);
    }
  }
  return all;
}

export function isBusinessDay(date, holidayMap) {
  const dow = date.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !holidayMap.has(toIsoDateUtc(date));
}

/**
 * Count business days in [startInclusive, endExclusive) in UTC day steps.
 */
export function businessDaysBetween(startInclusive, endExclusive, holidayMap) {
  if (!startInclusive || !endExclusive || endExclusive <= startInclusive) return 0;
  let count = 0;
  const d = new Date(startInclusive);
  while (d < endExclusive) {
    if (isBusinessDay(d, holidayMap)) count += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

/**
 * Inclusive business days between two calendar dates (normalized if reversed).
 * Same calendar day counts as 1 business day if that day is a business day; otherwise 0 (caller may clamp).
 */
export function inclusiveBusinessDaysInRange(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return 0;
  const lo = startDateStr <= endDateStr ? startDateStr : endDateStr;
  const hi = startDateStr <= endDateStr ? endDateStr : startDateStr;
  const minStart = new Date(`${lo}T00:00:00Z`);
  const endExclusive = new Date(`${hi}T00:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const holidayMap = buildFederalHolidayMap(minStart, endExclusive);
  return businessDaysBetween(minStart, endExclusive, holidayMap);
}

/**
 * Workdays gained when finishing early: exclusive of actual finish, inclusive of planned end.
 * Example: finished 2026-04-12, planned 2026-04-15 → counts 13,14,15 business days.
 */
export function workdaysGainedBetween(actualFinishIso, plannedEndIso) {
  if (!actualFinishIso || !plannedEndIso || actualFinishIso >= plannedEndIso) return 0;
  const dayAfterActual = new Date(`${actualFinishIso}T00:00:00Z`);
  dayAfterActual.setUTCDate(dayAfterActual.getUTCDate() + 1);
  const afterIso = toIsoDateUtc(dayAfterActual);
  if (afterIso > plannedEndIso) return 0;
  return inclusiveBusinessDaysInRange(afterIso, plannedEndIso);
}

/**
 * Days lost for weather-style ranges: inclusive business days, minimum 1 when both dates parse (matches prior UX).
 */
export function inclusiveBusinessDaysLost(startDateStr, endDateStr) {
  const n = inclusiveBusinessDaysInRange(startDateStr, endDateStr);
  return Math.max(1, n);
}

/**
 * Add signed business days to a YYYY-MM-DD anchor (UTC). Negative delta shifts backward.
 */
export function addBusinessDays(dateString, delta) {
  if (!dateString || !Number.isFinite(delta) || delta === 0) return dateString || null;
  let remaining = Math.trunc(delta);
  const dir = remaining > 0 ? 1 : -1;
  remaining = Math.abs(remaining);
  let d = new Date(`${dateString}T00:00:00Z`);
  const spanYears = Math.ceil(remaining / 200) + 2;
  const roughStart = new Date(d);
  roughStart.setUTCFullYear(roughStart.getUTCFullYear() - spanYears);
  const roughEnd = new Date(d);
  roughEnd.setUTCFullYear(roughEnd.getUTCFullYear() + spanYears);
  const holidayMap = buildFederalHolidayMap(roughStart, roughEnd);

  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + dir);
    if (isBusinessDay(d, holidayMap)) remaining -= 1;
  }
  return toIsoDateUtc(d);
}
