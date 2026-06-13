/** WMO weather interpretation codes (Open-Meteo) → i18n key under mobile.weather_wmo */

const EXACT_CODES = new Set([
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77,
  80, 81, 82, 85, 86, 95, 96, 99,
]);

/**
 * @param {number} code WMO weather code
 * @returns {string} i18n key
 */
export function getWeatherDescriptionKey(code) {
  const n = Number(code);
  if (!Number.isFinite(n)) return 'mobile.weather_wmo.unknown';
  if (EXACT_CODES.has(n)) return `mobile.weather_wmo.c${n}`;
  if (n >= 45 && n <= 48) return 'mobile.weather_wmo.fog';
  if (n >= 51 && n <= 57) return 'mobile.weather_wmo.drizzle';
  if (n >= 61 && n <= 67) return 'mobile.weather_wmo.rain';
  if (n >= 71 && n <= 77) return 'mobile.weather_wmo.snow';
  if (n >= 80 && n <= 82) return 'mobile.weather_wmo.rain';
  if (n >= 85 && n <= 86) return 'mobile.weather_wmo.snow';
  if (n >= 95 && n <= 99) return 'mobile.weather_wmo.thunderstorm';
  if (n >= 1 && n <= 3) return 'mobile.weather_wmo.cloudy';
  return 'mobile.weather_wmo.unknown';
}

/** @param {string} condition English bucket used for icon mapping */
export function getWeatherIconName(condition) {
  const c = condition?.toLowerCase() || '';
  if (c.includes('clear')) return 'sunny';
  if (c.includes('cloud')) return 'cloudy';
  if (c.includes('rain') || c.includes('drizzle')) return 'rainy';
  if (c.includes('thunderstorm')) return 'thunderstorm';
  if (c.includes('snow')) return 'snow';
  return 'partly-sunny';
}

/** @param {number} code WMO weather code */
export function getConditionFromCode(code) {
  if (code === 0) return 'Clear';
  if (code >= 1 && code <= 3) return 'Cloud';
  if (code >= 45 && code <= 48) return 'Fog';
  if (code >= 51 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain';
  if (code >= 85 && code <= 86) return 'Snow';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Cloud';
}

export function isSnowWeatherCode(code) {
  return (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
}
