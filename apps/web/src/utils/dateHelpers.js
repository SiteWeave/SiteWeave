import {
  localDateOnlyIso,
  addDaysToDateOnly,
  parseLocalDateOnly,
  formatLocalDateOnly,
  formatLocalDateRange,
  formatDateForDisplay,
  isDateOnlyString,
} from '@siteweave/core-logic';

export {
  parseLocalDateOnly,
  formatLocalDateOnly,
  formatLocalDateRange,
  formatDateForDisplay,
  isDateOnlyString,
};

/** Local calendar date as YYYY-MM-DD (avoids UTC midnight shifting the day). */
export function localDateIso(d = new Date()) {
  return localDateOnlyIso(d);
}

/** Add N calendar days to an ISO date string (YYYY-MM-DD). */
export function addDaysIso(iso, days) {
  return addDaysToDateOnly(iso, days);
}
