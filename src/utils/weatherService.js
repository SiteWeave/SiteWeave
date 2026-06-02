/**
 * Weather Service — fetches via get-weather edge function (API key on server).
 */
import { supabase } from '../supabaseClient.js';

export const WEATHER_ERROR_CODES = {
  MISSING_API_KEY: 'MISSING_API_KEY',
  GEOLOCATION_UNSUPPORTED: 'GEOLOCATION_UNSUPPORTED',
  GEOLOCATION_DENIED: 'GEOLOCATION_DENIED',
  GEOLOCATION_UNAVAILABLE: 'GEOLOCATION_UNAVAILABLE',
  GEOLOCATION_TIMEOUT: 'GEOLOCATION_TIMEOUT',
  INVALID_API_KEY: 'INVALID_API_KEY',
  CITY_NOT_FOUND: 'CITY_NOT_FOUND',
  API_ERROR: 'API_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
};

const createWeatherError = (code, message, details = null) => {
  const error = new Error(message);
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
};

async function invokeWeather(body) {
  const { data, error } = await supabase.functions.invoke('get-weather', { body });
  if (error) {
    throw createWeatherError(WEATHER_ERROR_CODES.NETWORK_ERROR, error.message || 'Weather request failed', {
      cause: error,
    });
  }
  if (data?.error) {
    const status = data.status ?? 500;
    if (status === 401 || status === 403) {
      throw createWeatherError(WEATHER_ERROR_CODES.INVALID_API_KEY, data.error);
    }
    if (status === 400) {
      throw createWeatherError(WEATHER_ERROR_CODES.CITY_NOT_FOUND, data.error);
    }
    throw createWeatherError(WEATHER_ERROR_CODES.API_ERROR, data.error, { status });
  }
  return data?.data;
}

export const getUserLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(createWeatherError(WEATHER_ERROR_CODES.GEOLOCATION_UNSUPPORTED, 'Geolocation is not supported by this browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        if (error?.code === 1) {
          reject(createWeatherError(WEATHER_ERROR_CODES.GEOLOCATION_DENIED, 'Location access was denied.'));
          return;
        }
        if (error?.code === 2) {
          reject(createWeatherError(WEATHER_ERROR_CODES.GEOLOCATION_UNAVAILABLE, 'Location is currently unavailable.'));
          return;
        }
        if (error?.code === 3) {
          reject(createWeatherError(WEATHER_ERROR_CODES.GEOLOCATION_TIMEOUT, 'Location request timed out.'));
          return;
        }
        reject(createWeatherError(WEATHER_ERROR_CODES.GEOLOCATION_UNAVAILABLE, 'Unable to retrieve device location.'));
      },
      {
        timeout: 10000,
        enableHighAccuracy: false,
      },
    );
  });
};

const mapCurrentWeather = (data) => ({
  temperature: Math.round(data.current.temp_f),
  feelsLike: Math.round(data.current.feelslike_f),
  description: data.current.condition.text,
  icon: data.current.condition.icon,
  humidity: data.current.humidity,
  windSpeed: Math.round(data.current.wind_mph || 0),
  city: data.location.name,
  country: data.location.country,
  latitude: data.location.lat,
  longitude: data.location.lon,
});

const mapForecast = (data) => data.forecast.forecastday.map((day) => ({
  date: new Date(day.date),
  temperature: Math.round(day.day.avgtemp_f),
  description: day.day.condition.text,
  icon: day.day.condition.icon,
}));

export const getCurrentWeather = async (latitude, longitude) => {
  try {
    const payload = await invokeWeather({ mode: 'current', latitude, longitude });
    return mapCurrentWeather(payload);
  } catch (error) {
    if (error?.code) throw error;
    throw createWeatherError(WEATHER_ERROR_CODES.NETWORK_ERROR, 'Unable to reach weather service.', { cause: error });
  }
};

const normalizeCityName = (cityName) => {
  if (!cityName || !cityName.trim()) {
    throw createWeatherError(WEATHER_ERROR_CODES.CITY_NOT_FOUND, 'Please enter a city name.');
  }
  return cityName.trim();
};

export const getCurrentWeatherByCity = async (cityName) => {
  const normalizedCity = normalizeCityName(cityName);
  try {
    const payload = await invokeWeather({ mode: 'current', city: normalizedCity });
    return mapCurrentWeather(payload);
  } catch (error) {
    if (error?.code) throw error;
    throw createWeatherError(WEATHER_ERROR_CODES.NETWORK_ERROR, 'Unable to reach weather service.', { cause: error });
  }
};

export const getWeatherForecast = async (latitude, longitude) => {
  try {
    const payload = await invokeWeather({ mode: 'forecast', latitude, longitude, days: 7 });
    return mapForecast(payload).slice(0, 7);
  } catch (error) {
    if (error?.code) throw error;
    throw createWeatherError(WEATHER_ERROR_CODES.NETWORK_ERROR, 'Unable to reach weather service.', { cause: error });
  }
};

export const getWeatherForecastByCity = async (cityName) => {
  const normalizedCity = normalizeCityName(cityName);
  try {
    const payload = await invokeWeather({ mode: 'forecast', city: normalizedCity, days: 7 });
    return mapForecast(payload).slice(0, 7);
  } catch (error) {
    if (error?.code) throw error;
    throw createWeatherError(WEATHER_ERROR_CODES.NETWORK_ERROR, 'Unable to reach weather service.', { cause: error });
  }
};

export const getExtendedWeatherForecast = async (cityName, days = 14) => {
  const normalizedCity = normalizeCityName(cityName);
  try {
    const maxDays = Math.min(days, 14);
    const payload = await invokeWeather({ mode: 'extended', city: normalizedCity, days: maxDays });
    const forecastMap = {};
    payload.forecast.forecastday.forEach((day) => {
      const [year, month, dayOfMonth] = day.date.split('-').map(Number);
      const date = new Date(year, month - 1, dayOfMonth);
      const dateKey = date.toDateString();

      forecastMap[dateKey] = {
        date,
        temperature: Math.round(day.day.avgtemp_f),
        high: Math.round(day.day.maxtemp_f),
        low: Math.round(day.day.mintemp_f),
        description: day.day.condition.text,
        icon: day.day.condition.icon,
      };
    });

    return forecastMap;
  } catch (error) {
    if (error?.code) throw error;
    throw createWeatherError(WEATHER_ERROR_CODES.NETWORK_ERROR, 'Unable to reach weather service.', { cause: error });
  }
};

export const getWeatherIconUrl = (iconUrl) => {
  if (iconUrl && iconUrl.startsWith('//')) {
    return `https:${iconUrl}`;
  }
  return iconUrl || '';
};
