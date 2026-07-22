/**
 * Field weather strip: icon + temp/condition/location/precip, log action on the right.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Card from './Card';
import PressableWithFade from '../PressableWithFade';
import { Text } from './Text';
import { colors, spacing } from '../../theme';
import { useBranding } from '../../context/BrandingContext';
import { useAuth } from '../../context/AuthContext';
import { hasCompletedLocationOnboarding } from '../../utils/onboarding';
import {
  getConditionFromCode,
  getWeatherDescriptionKey,
  getWeatherIconName,
  isSnowWeatherCode,
} from '../../utils/weatherDescriptions';
import { publishWeatherWidgetPatch } from '../../utils/publishWidgetSnapshot';

const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast';
const ICON_SIZE = 36;
const ICON_COLUMN = 44;
const PRECIP_SHOW_THRESHOLD = 15;

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
  const { user } = useAuth();
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [onboardingPending, setOnboardingPending] = useState(false);

  const loadWeather = useCallback(async ({ requestIfNeeded = false } = {}) => {
    try {
      setLoading(true);
      setError(null);
      setPermissionDenied(false);
      setOnboardingPending(false);

      const onboardingDone = await hasCompletedLocationOnboarding(user?.id);
      if (!onboardingDone) {
        setOnboardingPending(true);
        setLoading(false);
        return;
      }

      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' && requestIfNeeded) {
        const requested = await Location.requestForegroundPermissionsAsync();
        status = requested.status;
      }
      if (status !== 'granted') {
        setPermissionDenied(true);
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

      const nextWeather = {
        temperature: Math.round(data.current.temperature_2m),
        weatherCode: code,
        icon: getWeatherIconName(condition),
        locationLabel,
        precipProbability,
        precipIsSnow: isSnowWeatherCode(code),
        condition,
      };
      setWeather(nextWeather);
      publishWeatherWidgetPatch(nextWeather);
    } catch (e) {
      console.error(e);
      setError(t('mobile.weather_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t, user?.id]);

  useEffect(() => {
    loadWeather();
    const interval = setInterval(loadWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadWeather]);

  const logLabel = t('mobile.log_weather_short', { defaultValue: 'Log delay' });

  const weatherDescription = weather
    ? t(getWeatherDescriptionKey(weather.weatherCode))
    : null;

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

  const openSettings = () => {
    Linking.openSettings().catch(() => {});
  };

  return (
    <Card onPress={onPress} style={styles.card} testID={testID}>
      <View style={styles.row}>
        {loading ? (
          <View style={styles.weatherBlock}>
            <ActivityIndicator color={primaryColor} size="small" />
          </View>
        ) : onboardingPending ? (
          <View style={styles.weatherBlock}>
            <View style={styles.iconColumn}>
              <Ionicons name="cloud-outline" size={ICON_SIZE} color={colors.textMuted} />
            </View>
            <Text variant="bodyMedium" style={[styles.messageColumn]} numberOfLines={2}>
              {t('mobile.weather_onboarding_pending')}
            </Text>
          </View>
        ) : error ? (
          <View style={styles.weatherBlock}>
            <View style={styles.iconColumn}>
              <Ionicons name="cloud-offline-outline" size={ICON_SIZE} color={colors.textMuted} />
            </View>
            <View style={styles.errorColumn}>
              <Text variant="bodyMedium" style={styles.error} numberOfLines={2}>
                {error}
              </Text>
              {permissionDenied ? (
                <View style={styles.errorActions}>
                  <PressableWithFade onPress={openSettings} testID="weather-open-settings">
                    <Text style={[styles.errorActionText, { color: primaryColor }]}>
                      {t('mobile.weather_open_settings')}
                    </Text>
                  </PressableWithFade>
                  <PressableWithFade onPress={() => loadWeather({ requestIfNeeded: true })} testID="weather-retry">
                    <Text style={[styles.errorActionText, { color: primaryColor }]}>
                      {t('mobile.weather_retry')}
                    </Text>
                  </PressableWithFade>
                </View>
              ) : (
                <PressableWithFade onPress={() => loadWeather({ requestIfNeeded: true })} testID="weather-retry">
                  <Text style={[styles.errorActionText, { color: primaryColor }]}>
                    {t('mobile.weather_retry')}
                  </Text>
                </PressableWithFade>
              )}
            </View>
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
                {weatherDescription}
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
  errorColumn: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  errorActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  errorActionText: {
    fontSize: 14,
    fontWeight: '600',
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
