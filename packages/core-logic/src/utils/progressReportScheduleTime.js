/**
 * Progress report send-time helpers (aligned with send-progress-report edge function).
 */

const TIMEZONE_SHORT_LABELS = {
  'America/New_York': 'Eastern',
  'America/Chicago': 'Central',
  'America/Denver': 'Mountain',
  'America/Los_Angeles': 'Pacific',
  'America/Anchorage': 'Alaska',
  'Pacific/Honolulu': 'Hawaii',
};

/**
 * Format hour 0–23 as a 12-hour clock label (e.g. "8:00 AM").
 * @param {number} hour
 * @returns {string}
 */
export function formatSendHourLabel(hour) {
  const safeHour = Number.isFinite(Number(hour))
    ? Math.max(0, Math.min(23, Number(hour)))
    : 8;
  const period = safeHour < 12 ? 'AM' : 'PM';
  const displayHour = safeHour % 12 === 0 ? 12 : safeHour % 12;
  return `${displayHour}:00 ${period}`;
}

/**
 * Format an IANA timezone for send-time summaries.
 * @param {string} timeZone
 * @returns {string}
 */
export function formatTimezoneLabel(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return TIMEZONE_SHORT_LABELS['America/New_York'];
  if (TIMEZONE_SHORT_LABELS[timeZone]) return TIMEZONE_SHORT_LABELS[timeZone];
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    const tzPart = parts.find((part) => part.type === 'timeZoneName');
    return tzPart?.value || timeZone;
  } catch {
    return timeZone;
  }
}

function getDateTimeParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const mapped = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(mapped.year),
    month: Number(mapped.month),
    day: Number(mapped.day),
    hour: Number(mapped.hour),
    minute: Number(mapped.minute),
    second: Number(mapped.second),
  };
}

function getLocalCalendarDate(date, timeZone) {
  const parts = getDateTimeParts(date, timeZone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function zonedDateTimeToUtc(desired, timeZone) {
  let utcGuess = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second
  );

  for (let i = 0; i < 3; i += 1) {
    const actual = getDateTimeParts(new Date(utcGuess), timeZone);
    const desiredAsUtc = Date.UTC(
      desired.year,
      desired.month - 1,
      desired.day,
      desired.hour,
      desired.minute,
      desired.second
    );
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    utcGuess += desiredAsUtc - actualAsUtc;
  }

  return new Date(utcGuess);
}

function withLocalHour(value, sendHourLocal, timeZone) {
  const safeHour = Number.isFinite(Number(sendHourLocal))
    ? Math.max(0, Math.min(23, Number(sendHourLocal)))
    : 8;
  return zonedDateTimeToUtc(
    {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
      hour: safeHour,
      minute: 0,
      second: 0,
    },
    timeZone
  );
}

/**
 * Next send after a successful send (or from last_sent_at).
 * @param {string} frequency
 * @param {number|null} frequencyValue
 * @param {Date|string} lastSentAt
 * @param {number} sendHourLocal
 * @param {string} timeZone
 * @returns {Date|null}
 */
export function calculateNextSendDate(
  frequency,
  frequencyValue,
  lastSentAt,
  sendHourLocal = 8,
  timeZone = 'America/New_York'
) {
  const baseDate = new Date(lastSentAt);
  const dayOfWeek =
    frequencyValue != null && frequencyValue >= 0 && frequencyValue <= 6 ? frequencyValue : 0;
  const baseLocalDate = getLocalCalendarDate(baseDate, timeZone);

  switch (frequency) {
    case 'weekly': {
      const next = new Date(baseLocalDate);
      next.setUTCDate(next.getUTCDate() + 7);
      while (next.getUTCDay() !== dayOfWeek) next.setUTCDate(next.getUTCDate() + 1);
      return withLocalHour(next, sendHourLocal, timeZone);
    }
    case 'bi-weekly': {
      const next = new Date(baseLocalDate);
      next.setUTCDate(next.getUTCDate() + 14);
      while (next.getUTCDay() !== dayOfWeek) next.setUTCDate(next.getUTCDate() + 1);
      return withLocalHour(next, sendHourLocal, timeZone);
    }
    case 'monthly': {
      const y = baseLocalDate.getUTCFullYear();
      const m = baseLocalDate.getUTCMonth();
      if (frequencyValue === -1 || frequencyValue === 31) {
        return withLocalHour(new Date(Date.UTC(y, m + 2, 0)), sendHourLocal, timeZone);
      }
      if (frequencyValue === 15) {
        return withLocalHour(new Date(Date.UTC(y, m + 1, 15)), sendHourLocal, timeZone);
      }
      return withLocalHour(new Date(Date.UTC(y, m + 1, 1)), sendHourLocal, timeZone);
    }
    case 'custom':
      if (frequencyValue && frequencyValue > 0) {
        const next = new Date(baseLocalDate);
        next.setUTCDate(next.getUTCDate() + frequencyValue);
        return withLocalHour(next, sendHourLocal, timeZone);
      }
      return null;
    case 'manual':
      return null;
    default:
      return null;
  }
}

/**
 * First scheduled send when the schedule has never been sent (last_sent_at is null).
 * @param {string} frequency
 * @param {number|null} frequencyValue
 * @param {number} sendHourLocal
 * @param {string} timeZone
 * @returns {Date|null}
 */
export function calculateFirstSendDate(
  frequency,
  frequencyValue,
  sendHourLocal = 8,
  timeZone = 'America/New_York'
) {
  const now = new Date();
  const dayOfWeek =
    frequencyValue != null && frequencyValue >= 0 && frequencyValue <= 6 ? frequencyValue : 0;
  const todayLocal = getLocalCalendarDate(now, timeZone);

  switch (frequency) {
    case 'weekly':
    case 'bi-weekly': {
      const next = new Date(todayLocal);
      while (next.getUTCDay() !== dayOfWeek) next.setUTCDate(next.getUTCDate() + 1);
      let candidate = withLocalHour(next, sendHourLocal, timeZone);
      if (candidate <= now) {
        next.setUTCDate(next.getUTCDate() + (frequency === 'bi-weekly' ? 14 : 7));
        while (next.getUTCDay() !== dayOfWeek) next.setUTCDate(next.getUTCDate() + 1);
        candidate = withLocalHour(next, sendHourLocal, timeZone);
      }
      return candidate;
    }
    case 'monthly': {
      const tryMonth = (y, m) => {
        let dayUtc;
        if (frequencyValue === -1 || frequencyValue === 31) {
          dayUtc = new Date(Date.UTC(y, m + 1, 0));
        } else if (frequencyValue === 15) {
          dayUtc = new Date(Date.UTC(y, m, 15));
        } else {
          dayUtc = new Date(Date.UTC(y, m, 1));
        }
        return withLocalHour(dayUtc, sendHourLocal, timeZone);
      };
      let y = todayLocal.getUTCFullYear();
      let m = todayLocal.getUTCMonth();
      let candidate = tryMonth(y, m);
      if (candidate <= now) {
        m += 1;
        if (m > 11) {
          m = 0;
          y += 1;
        }
        candidate = tryMonth(y, m);
      }
      return candidate;
    }
    case 'custom':
      if (frequencyValue && frequencyValue > 0) {
        const next = new Date(todayLocal);
        next.setUTCDate(next.getUTCDate() + frequencyValue);
        return withLocalHour(next, sendHourLocal, timeZone);
      }
      return null;
    case 'manual':
      return null;
    default:
      return null;
  }
}

/**
 * @param {Object} schedule
 * @param {{ sendHour?: number, timeZone?: string }|null} [orgFallback]
 * @returns {{ sendHour: number, timeZone: string }}
 */
export function resolveScheduleSendSettings(schedule, orgFallback = null) {
  const sendHour = Number.isFinite(Number(schedule?.send_hour))
    ? Math.max(0, Math.min(23, Number(schedule.send_hour)))
    : Number.isFinite(Number(orgFallback?.sendHour))
      ? Number(orgFallback.sendHour)
      : 8;
  const timeZone =
    typeof schedule?.send_timezone === 'string' && schedule.send_timezone
      ? schedule.send_timezone
      : typeof orgFallback?.timeZone === 'string' && orgFallback.timeZone
        ? orgFallback.timeZone
        : 'America/New_York';
  return { sendHour, timeZone };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} organizationId
 * @returns {Promise<{ sendHour: number, timeZone: string }>}
 */
export async function getOrgProgressReportScheduleSettings(supabase, organizationId) {
  const { data, error } = await supabase
    .from('organizations')
    .select('progress_report_send_hour, progress_report_timezone')
    .eq('id', organizationId)
    .maybeSingle();
  if (error) throw error;
  return {
    sendHour: Number.isFinite(Number(data?.progress_report_send_hour))
      ? Number(data.progress_report_send_hour)
      : 8,
    timeZone:
      typeof data?.progress_report_timezone === 'string' && data.progress_report_timezone
        ? data.progress_report_timezone
        : 'America/New_York',
  };
}

/**
 * Resolve next_send_at for an active recurring schedule.
 * @param {Object} params
 * @param {string} params.frequency
 * @param {number|null} params.frequency_value
 * @param {string|null} params.last_sent_at
 * @param {boolean} params.is_active
 * @param {number} params.sendHour
 * @param {string} params.timeZone
 * @returns {Date|null}
 */
export function resolveScheduleNextSendAt({
  frequency,
  frequency_value,
  last_sent_at,
  is_active,
  sendHour,
  timeZone,
}) {
  if (!is_active || frequency === 'manual') return null;
  if (last_sent_at) {
    return calculateNextSendDate(
      frequency,
      frequency_value,
      last_sent_at,
      sendHour,
      timeZone
    );
  }
  return calculateFirstSendDate(frequency, frequency_value, sendHour, timeZone);
}

/**
 * Format next_send_at in the schedule's timezone for list cards.
 * @param {string|null|undefined} nextSendAtIso
 * @param {string} [locale]
 * @param {string} [timeZone]
 * @returns {string|null}
 */
export function formatScheduleNextSendAt(nextSendAtIso, locale = 'en', timeZone = 'America/New_York') {
  if (!nextSendAtIso) return null;
  const date = new Date(nextSendAtIso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString(locale);
  }
}
