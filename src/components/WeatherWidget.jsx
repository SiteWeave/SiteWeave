import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  getCurrentWeather, 
  getWeatherForecast, 
  getCurrentWeatherByCity,
  getWeatherForecastByCity,
  getUserLocation, 
  getWeatherIconUrl 
} from '../utils/weatherService';

const CITY_STORAGE_KEY = 'weather_location_preference';
const WEATHER_PREF_EVENT = 'weather-preference-changed';

function WeatherWidget({ compact = false }) {
  const { t, i18n } = useTranslation();
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [optedIn, setOptedIn] = useState(false);
  const [showSourceSelection, setShowSourceSelection] = useState(false);
  const [showCityInput, setShowCityInput] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const [source, setSource] = useState(null);
  const inputRef = useRef(null);
  const widgetRef = useRef(null);

  useEffect(() => {
    setLoading(false);
    setWeather(null);
    setForecast([]);
    setOptedIn(false);
    setShowSourceSelection(false);
    setShowCityInput(false);
    setError(null);
  }, []);

  // Handle click outside to close input
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target)) {
        // Only close if we have a valid city or if input is empty
        if (cityInput.trim() && !loading) {
          loadWeatherByCity(cityInput.trim());
        } else if (!cityInput.trim()) {
          setShowCityInput(false);
        }
      }
    };

    if (showCityInput) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus the input when it opens
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCityInput, cityInput, loading]);

  const emitPreferenceChange = (nextCity = null, nextSource = null) => {
    try {
      window.dispatchEvent(
        new CustomEvent(WEATHER_PREF_EVENT, {
          detail: {
            city: nextCity,
            source: nextSource,
            enabled: optedIn,
          },
        }),
      );
    } catch (err) {
      // Best effort only
    }
  };

  const handleImplementWeather = () => {
    setOptedIn(true);
    setShowSourceSelection(true);
    setShowCityInput(false);
    setWeather(null);
    setForecast([]);
    setError(null);
    setSource(null);
    emitPreferenceChange(null, null);
  };

  const loadWeatherFromLocation = async () => {
    try {
      setLoading(true);
      setError(null);
      setShowCityInput(false);
      setShowSourceSelection(false);
      setSource('geo');

      const location = await getUserLocation();

      const [currentWeather, weatherForecast] = await Promise.all([
        getCurrentWeather(location.latitude, location.longitude),
        getWeatherForecast(location.latitude, location.longitude),
      ]);

      setWeather(currentWeather);
      setForecast(weatherForecast || []);
      localStorage.setItem(CITY_STORAGE_KEY, currentWeather.city);
      emitPreferenceChange(currentWeather.city, 'geo');
    } catch (err) {
      if (err.code !== 1 && err.code !== 2 && err.code !== 3) {
        console.error('Error loading weather from location:', err);
      }
      setError(t('weather.location_error'));
      setSource('manualCity');
      setShowSourceSelection(false);
      setShowCityInput(true);
      setWeather(null);
      setForecast([]);
    } finally {
      setLoading(false);
    }
  };

  const loadWeatherByCity = async (cityName, keepInputOpen = false) => {
    if (!cityName || cityName.trim() === '') {
      setError(t('weather.enter_city'));
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setShowSourceSelection(false);
      setSource('manualCity');
      if (!keepInputOpen) {
        setShowCityInput(false);
      }

      const [currentWeather, weatherForecast] = await Promise.all([
        getCurrentWeatherByCity(cityName.trim()),
        getWeatherForecastByCity(cityName.trim()),
      ]);

      setWeather(currentWeather);
      setForecast(weatherForecast || []);
      localStorage.setItem(CITY_STORAGE_KEY, cityName.trim());
      emitPreferenceChange(cityName.trim(), 'manualCity');
    } catch (err) {
      console.error('Error loading weather by city:', err);
      setError(err.message || t('weather.load_error'));
      setShowCityInput(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCitySubmit = (e) => {
    e.preventDefault();
    loadWeatherByCity(cityInput);
  };

  const handleChooseManualCity = () => {
    const savedCity = localStorage.getItem(CITY_STORAGE_KEY) || '';
    setCityInput(savedCity);
    setSource('manualCity');
    setShowSourceSelection(false);
    setShowCityInput(true);
    setError(null);
  };

  const handleResetWeather = () => {
    setOptedIn(false);
    setSource(null);
    setError(null);
    setWeather(null);
    setForecast([]);
    setShowCityInput(false);
    setShowSourceSelection(false);
    setLoading(false);
    emitPreferenceChange(null, null);
  };

  if (!optedIn) {
    if (compact) {
      return (
        <button
          type="button"
          onClick={handleImplementWeather}
          className="px-3 py-2 text-xs font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {t('weather.enable_weather')}
        </button>
      );
    }

    return (
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="text-sm text-gray-600 mb-3">
          {t('weather.privacy_off')}
        </div>
        <button
          type="button"
          onClick={handleImplementWeather}
          className="w-full text-sm px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          {t('weather.enable_weather')}
        </button>
      </div>
    );
  }

  if (showSourceSelection && !loading) {
    const sourceChooser = (
      <div className={compact ? 'absolute top-full right-0 mt-2 z-50 bg-white p-3 rounded-lg border border-gray-200 shadow-lg min-w-[230px]' : 'space-y-2'}>
        <button
          type="button"
          onClick={loadWeatherFromLocation}
          className="w-full text-xs px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          {t('weather.use_location')}
        </button>
        <button
          type="button"
          onClick={handleChooseManualCity}
          className="w-full text-xs px-3 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200 transition-colors"
        >
          {t('weather.change_location')}
        </button>
      </div>
    );

    if (compact) {
      return (
        <div ref={widgetRef} className="relative flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200">
          <span className="text-xs text-gray-600">{t('weather.choose_source')}</span>
          {sourceChooser}
        </div>
      );
    }

    return (
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="text-sm text-gray-600 mb-3">{t('weather.choose_source_desc')}</div>
        {sourceChooser}
      </div>
    );
  };

  if (loading) {
    if (compact) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <span className="text-xs text-gray-500">{t('common.loading')}</span>
        </div>
      );
    }
    return (
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  // Show city input form if geolocation failed or user wants to enter city
  if (showCityInput && !weather) {
    return (
      <div ref={widgetRef} className="bg-white p-4 rounded-lg border border-gray-200">
        {error && !error.includes('API key') && (
          <div className="text-xs text-gray-500 mb-2">
            {error.includes('location') ? t('weather.location_fallback') : error}
          </div>
        )}
        <form onSubmit={handleCitySubmit} className="relative">
          <input
            ref={inputRef}
            type="text"
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            placeholder={t('weather.city_placeholder')}
            className="w-full px-3 pr-10 py-1.5 text-xs border border-gray-300 rounded focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <button
            type="button"
            onClick={loadWeatherFromLocation}
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 disabled:opacity-50"
            title={t('weather.use_location')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </form>
      </div>
    );
  }

  // Show error state only for API key errors (not geolocation errors, as those show city input)
  if (error && !weather && !showCityInput) {
    return (
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="text-xs text-gray-500 mb-3">
          {error.includes('API key') ? (
            <span>{t('weather.api_key_not_configured')}</span>
          ) : (
            <span>{error}</span>
          )}
        </div>
        <button type="button"
          onClick={() => setShowCityInput(true)}
          className="w-full text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          {t('weather.change_location')}
        </button>
      </div>
    );
  }

  if (!weather) {
    return null;
  }

  // Compact mode for header
  if (compact) {
    return (
      <div ref={widgetRef} className="relative flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 hover:shadow-xs transition-shadow">
        {weather.icon && (
          <img
            src={getWeatherIconUrl(weather.icon)}
            alt={weather.description}
            className="w-4 h-4"
          />
        )}
        <div className="flex flex-col">
          <div className="text-sm font-semibold text-gray-900 leading-tight">
            {weather.temperature}°F
          </div>
          <div className="text-xs text-gray-500 leading-tight">
            {weather.city}
          </div>
        </div>
        <div className="flex items-center gap-1 ml-1">
          <button type="button"
            onClick={() => {
              const currentCity = localStorage.getItem(CITY_STORAGE_KEY) || weather?.city || '';
              setCityInput(currentCity);
              setShowCityInput(true);
              setSource('manualCity');
            }}
            className="text-xs text-gray-400 hover:text-gray-600 p-1"
            title={t('weather.change_location')}
          >
            ⚙
          </button>
          <button type="button"
            onClick={() => {
              if (source === 'geo') {
                loadWeatherFromLocation();
              } else {
                const savedCity = localStorage.getItem(CITY_STORAGE_KEY) || weather?.city || cityInput;
                if (savedCity) {
                  loadWeatherByCity(savedCity);
                }
              }
            }}
            className="text-xs text-gray-400 hover:text-gray-600 p-1"
            title={t('weather.refresh')}
          >
            ↻
          </button>
          <button type="button"
            onClick={handleResetWeather}
            className="text-xs text-gray-400 hover:text-gray-600 p-1"
            title={t('weather.disable')}
          >
            ✕
          </button>
        </div>
        {showCityInput && (
          <div className="absolute top-full right-0 mt-2 z-50 bg-white p-3 rounded-lg border border-gray-200 shadow-lg min-w-[250px]">
            <form onSubmit={(e) => { 
              e.preventDefault(); 
              loadWeatherByCity(cityInput);
            }} className="relative">
              <input
                ref={inputRef}
                type="text"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                placeholder={t('weather.city_placeholder')}
                className="w-full px-2 pr-8 py-1 text-xs border border-gray-300 rounded focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              <button
                type="button"
                onClick={loadWeatherFromLocation}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                title={t('weather.use_location')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={widgetRef} className="bg-white p-4 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={() => {
              const currentCity = localStorage.getItem(CITY_STORAGE_KEY) || weather?.city || '';
              setCityInput(currentCity);
              setShowCityInput(true);
              setSource('manualCity');
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
            title={t('weather.change_location')}
          >
            ⚙
          </button>
          <button type="button"
            onClick={() => {
              if (source === 'geo') {
                loadWeatherFromLocation();
              } else {
                const savedCity = localStorage.getItem(CITY_STORAGE_KEY) || weather?.city || cityInput;
                if (savedCity) {
                  loadWeatherByCity(savedCity);
                }
              }
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
            title={t('weather.refresh')}
          >
            ↻
          </button>
          <button type="button"
            onClick={handleResetWeather}
            className="text-xs text-gray-400 hover:text-gray-600"
            title={t('weather.disable')}
          >
            ✕
          </button>
        </div>
      </div>

      {showCityInput && (
        <div className="mb-3 p-2 bg-gray-50 rounded border border-gray-200">
          <form onSubmit={(e) => { 
            e.preventDefault(); 
            loadWeatherByCity(cityInput);
          }} className="relative">
            <input
              ref={inputRef}
              type="text"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder={t('weather.city_placeholder')}
              className="w-full px-2 pr-8 py-1 text-xs border border-gray-300 rounded focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={loadWeatherFromLocation}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              title={t('weather.use_location')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* Current Weather */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          {weather.icon && (
            <img
              src={getWeatherIconUrl(weather.icon)}
              alt={weather.description}
              className="w-12 h-12"
            />
          )}
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {weather.temperature}°F
            </div>
            <div className="text-xs text-gray-500 capitalize">
              {weather.description}
            </div>
          </div>
        </div>
        <div className="text-xs text-gray-600">
          {weather.city}, {weather.country}
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <span>{t('weather.feels_like', { temp: weather.feelsLike })}</span>
          {weather.humidity && <span>{t('weather.humidity', { percent: weather.humidity })}</span>}
        </div>
      </div>

      {/* Forecast */}
      {forecast.length > 0 && (
        <div className="border-t border-gray-200 pt-3">
          <h4 className="text-xs font-semibold text-gray-500 mb-2">{t('weather.forecast')}</h4>
          <div className="space-y-2">
            {forecast.map((day, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {day.icon && (
                    <img
                      src={getWeatherIconUrl(day.icon)}
                      alt={day.description}
                      className="w-6 h-6"
                    />
                  )}
                  <span className="text-gray-600">
                    {index === 0
                      ? t('common.today')
                      : day.date.toLocaleDateString(i18n.language, { weekday: 'short' })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 capitalize">{day.description}</span>
                  <span className="font-semibold text-gray-900">{day.temperature}°F</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default WeatherWidget;

