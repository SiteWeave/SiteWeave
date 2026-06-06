/** Local calendar date as YYYY-MM-DD (never UTC-shifted). */
export function toLocalDateIso(date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseLocalDateIso(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** HH:MM in local time from a Date. */
export function formatLocalTime(date) {
  if (!date || Number.isNaN(date.getTime())) return '09:00';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function parseTimeOnDate(dateIso, timeHm) {
  const base = parseLocalDateIso(dateIso) || new Date();
  const [hh = 0, mm = 0] = String(timeHm || '00:00').split(':').map((n) => Number(n) || 0);
  const d = new Date(base);
  d.setHours(hh, mm, 0, 0);
  return d;
}

export function roundTimeToInterval(date, intervalMinutes = 15) {
  const d = new Date(date);
  const rounded = Math.round(d.getMinutes() / intervalMinutes) * intervalMinutes;
  d.setMinutes(rounded, 0, 0);
  return d;
}

export function addMinutesToTimeHm(timeHm, minutes) {
  const d = parseTimeOnDate(toLocalDateIso(new Date()), timeHm);
  d.setMinutes(d.getMinutes() + minutes);
  return formatLocalTime(d);
}

export function compareTimeHm(a, b) {
  const [ah = 0, am = 0] = String(a || '00:00').split(':').map(Number);
  const [bh = 0, bm = 0] = String(b || '00:00').split(':').map(Number);
  return ah * 60 + am - (bh * 60 + bm);
}

export function ensureEndAfterStart(startHm, endHm, minGapMinutes = 30) {
  if (compareTimeHm(endHm, startHm) <= 0) {
    return addMinutesToTimeHm(startHm, minGapMinutes);
  }
  return endHm;
}
