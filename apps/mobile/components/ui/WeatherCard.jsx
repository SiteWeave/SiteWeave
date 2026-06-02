/**
 * Field weather strip: icon + temp/condition/location/precip, log action on the right.
 */
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Card from './Card';
import PressableWithFade from '../PressableWithFade';
import { Text } from './Text';
import { colors, spacing } from '../../theme';
import { useBranding } from '../../context/BrandingContext';

const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast';
const ICON_SIZE = 36;
const ICON_COLUMN = 44;
const PRECIP_SHOW_THRESHOLD = 15;

const getWeatherIcon = (condition) => {
  const c = condition?.toLowerCase() || '';
  if (c.includes('clear')) return 'sunny';
  if (c.includes('cloud')) return 'cloudy';
  if (c.includes('rain') || c.includes('drizzle')) return 'rainy';
  if (c.includes('thunderstorm')) return 'thunderstorm';
  if (c.includes('snow')) return 'snow';
  return 'partly-sunny';
};

const getConditionFromCode = (code) => {
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

function isSnowWeatherCode(code) {
  return (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
}

const DESCRIPTIONS = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  61: 'Rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  95: 'Thunderstorm',
};

function getDescriptionFromCode(code) {
  return DESCRIPTIONS[code] || getConditionFromCode(code);
}

async function resolveLocationLabel(latitude, longitude) {
  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    const place = places?.[0];
    if (!place) return null;
    const city = place.city || place.subregion || place.district;
    const region = place.region || place.country;
    if (city && region && city !== region) return `${city}, ${region}`;
    return city || region || null;
  } catch {
    return null;
  }
}

export default function WeatherCard({ onPress, onLogWeather, testID = 'weather-card' }) {
  const { t } = useTranslation();
  const { primaryColor } = useBranding();
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadWeather();
    const interval = setInterval(loadWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadWeather = async () => {
    try {
      setLoading(true);
      setError(null);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError(t('mobile.weather_location_required'));
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;

      const [forecastRes, locationLabel] = await Promise.all([
        fetch(
          `${WEATHER_API_URL}?latitude=${latitude}&longitude=${longitude}` +
            '&current=temperature_2m,weather_code,precipitation_probability' +
            '&temperature_unit=fahrenheit&timezone=auto',
        ),
        resolveLocationLabel(latitude, longitude),
      ]);

      const data = await forecastRes.json();
      if (!data?.current) throw new Error('Invalid weather data');

      const code = data.current.weather_code;
      const condition = getConditionFromCode(code);
      const precipProbability =
        data.current.precipitation_probability != null
          ? Math.round(data.current.precipitation_probability)
          : null;

      setWeather({
        temperature: Math.round(data.current.temperature_2m),
        description: getDescriptionFromCode(code),
        icon: getWeatherIcon(condition),
        locationLabel,
        precipProbability,
        precipIsSnow: isSnowWeatherCode(code),
      });
    } catch (e) {
      console.error(e);
      setError(t('mobile.weather_load_failed'));
    } finally {
      setLoading(false);
    }
  };

  const logLabel = t('mobile.log_weather_short', { defaultValue: 'Log delay' });

  const precipLine =
    weather &&
    weather.precipProbability != null &&
    weather.precipProbability >= PRECIP_SHOW_THRESHOLD
      ? weather.precipIsSnow
        ? t('mobile.weather_chance_snow', { percent: weather.precipProbability })
        : t('mobile.weather_chance_rain', { percent: weather.precipProbability })
      : null;

  const logWeatherControl = onLogWeather ? (
    <PressableWithFade
      style={[styles.logPill, { backgroundColor: colors.primaryLight }]}
      onPress={onLogWeather}
      testID="weather-log-delay"
      accessibilityRole="button"
      accessibilityLabel={t('mobile.log_weather_delay')}
    >
      <Ionicons name="rainy-outline" size={16} color={primaryColor} />
      <Text style={[styles.logPillText, { color: primaryColor }]} numberOfLines={1}>
        {logLabel}
      </Text>
    </PressableWithFade>
  ) : null;

  return (
    <Card onPress={onPress} style={styles.card} testID={testID}>
      <View style={styles.row}>
        {loading ? (
          <View style={styles.weatherBlock}>
            <ActivityIndicator color={primaryColor} size="small" />
          </View>
        ) : error ? (
          <View style={styles.weatherBlock}>
            <View style={styles.iconColumn}>
              <Ionicons name="cloud-offline-outline" size={ICON_SIZE} color={colors.textMuted} />
            </View>
            <Text variant="bodyMedium" style={[styles.error, styles.messageColumn]} numberOfLines={2}>
              {error}
            </Text>
          </View>
        ) : weather ? (
          <View style={styles.weatherBlock}>
            <View style={styles.iconColumn}>
              <Ionicons name={weather.icon} size={ICON_SIZE} color={primaryColor} />
            </View>
            <View style={styles.copyColumn}>
              <View style={styles.tempRow}>
                <Text style={styles.temp}>{weather.temperature}</Text>
                <Text style={styles.unit}>°F</Text>
              </View>
              <Text variant="bodyMedium" style={styles.description} numberOfLines={1}>
                {weather.description}
              </Text>
              {precipLine ? (
                <Text variant="bodyMedium" style={styles.precip} numberOfLines={1}>
                  {precipLine}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.weatherBlock} />
        )}
        {weather?.locationLabel || logWeatherControl ? (
          <View style={styles.rightColumn}>
            {weather?.locationLabel ? (
              <Text variant="bodyMedium" style={styles.locationRight} numberOfLines={2}>
                {weather.locationLabel}
              </Text>
            ) : null}
            {logWeatherControl}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  weatherBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: spacing.lg,
  },
  iconColumn: {
    width: ICON_COLUMN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  messageColumn: {
    flex: 1,
    minWidth: 0,
    color: colors.textMuted,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  temp: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 30,
    includeFontPadding: false,
  },
  unit: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    marginLeft: 2,
    lineHeight: 20,
    includeFontPadding: false,
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
  },
  rightColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
    gap: spacing.xs,
    maxWidth: '42%',
  },
  locationRight: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 17,
    textAlign: 'right',
    includeFontPadding: false,
  },
  precip: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
    includeFontPadding: false,
  },
  error: { color: colors.textMuted },
  logPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
  },
  logPillText: {
    fontWeight: '700',
    fontSize: 14,
    includeFontPadding: false,
  },
});
