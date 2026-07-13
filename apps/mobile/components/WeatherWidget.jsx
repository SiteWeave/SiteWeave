/**
 * Weather Widget Component
 * Displays current weather based on GPS location
 * GPS is ONLY used for weather - no tracking or other location services
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { shadows } from '../theme';

// Using Open-Meteo API (free, no API key required)
const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast';

// Weather icon mapping
const getWeatherIcon = (condition) => {
  const conditionLower = condition?.toLowerCase() || '';
  if (conditionLower.includes('clear')) return 'sunny';
  if (conditionLower.includes('cloud')) return 'cloudy';
  if (conditionLower.includes('rain') || conditionLower.includes('drizzle')) return 'rainy';
  if (conditionLower.includes('thunderstorm')) return 'thunderstorm';
  if (conditionLower.includes('snow')) return 'snow';
  if (conditionLower.includes('mist') || conditionLower.includes('fog')) return 'cloudy';
  return 'partly-sunny';
};

// Convert WMO weather code to condition
const getConditionFromCode = (code) => {
  // WMO Weather interpretation codes (WW)
  if (code === 0) return 'Clear';
  if (code >= 1 && code <= 3) return 'Cloud';
  if (code >= 45 && code <= 48) return 'Fog';
  if (code >= 51 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain';
  if (code >= 85 && code <= 86) return 'Snow';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Cloud';
};

const getDescriptionFromCode = (code) => {
  const descriptions = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return descriptions[code] || 'Unknown';
};

export default function WeatherWidget() {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locationPermission, setLocationPermission] = useState(false);

  useEffect(() => {
    requestLocationAndFetchWeather();
    
    // Refresh weather every 30 minutes
    const interval = setInterval(() => {
      requestLocationAndFetchWeather();
    }, 30 * 60 * 1000); // 30 minutes

    return () => clearInterval(interval);
  }, []);

  const requestLocationAndFetchWeather = async () => {
    try {
      setLoading(true);
      setError(null);

      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        setLocationPermission(false);
        setError('Location permission denied. Weather unavailable.');
        setLoading(false);
        return;
      }

      setLocationPermission(true);

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Fetch weather data
      await fetchWeather(location.coords.latitude, location.coords.longitude);
    } catch (err) {
      console.error('Error getting location:', err);
      setError('Unable to get location for weather.');
      setLoading(false);
    }
  };

  const fetchWeather = async (lat, lon) => {
    try {
      // Use Open-Meteo API (free, no API key required)
      const response = await fetch(
        `${WEATHER_API_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`
      );

      if (!response.ok) {
        throw new Error('Weather API request failed');
      }

      const data = await response.json();
      
      if (!data.current) {
        throw new Error('Invalid weather data received');
      }

      // Convert weather code to condition
      const weatherCode = data.current.weather_code;
      const condition = getConditionFromCode(weatherCode);
      
      setWeather({
        temperature: Math.round(data.current.temperature_2m),
        condition: condition,
        description: getDescriptionFromCode(weatherCode),
        icon: getWeatherIcon(condition),
      });
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching weather:', err);
      setError('Unable to fetch weather data.');
      setLoading(false);
    }
  };

  if (!locationPermission && !loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Ionicons name="location-outline" size={20} color="#6B7280" />
          <Text style={styles.errorText}>Location permission needed for weather</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="small" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading weather...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Ionicons name="cloud-offline-outline" size={20} color="#6B7280" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!weather) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Ionicons 
          name={weather.icon} 
          size={32} 
          color="#3B82F6" 
          style={styles.icon}
        />
        <View style={styles.weatherInfo}>
          <View style={styles.temperatureRow}>
            <Text style={styles.temperature}>{weather.temperature}°</Text>
            <Text style={styles.unit}>F</Text>
          </View>
          <Text style={styles.condition} numberOfLines={1}>
            {weather.description}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    ...shadows.card,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    marginRight: 4,
  },
  weatherInfo: {
    flex: 1,
  },
  temperatureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  temperature: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
  },
  unit: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 4,
  },
  condition: {
    fontSize: 14,
    color: '#4B5563',
    textTransform: 'capitalize',
    marginTop: 2,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
  },
});
