import { Platform } from 'react-native';
import * as Application from 'expo-application';

function parseParts(version) {
  return String(version || '0')
    .split('.')
    .map((part) => parseInt(part, 10) || 0);
}

export function compareSemver(a, b) {
  const left = parseParts(a);
  const right = parseParts(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }

  return 0;
}

export function isVersionLessThan(current, target) {
  if (!target) return false;
  return compareSemver(current, target) < 0;
}

export function getNativeApplicationVersion() {
  return Application.nativeApplicationVersion || '0.0.0';
}

export function getStoreUrl(releaseConfig) {
  if (!releaseConfig) return null;
  return Platform.OS === 'ios'
    ? releaseConfig.ios_store_url
    : releaseConfig.android_store_url;
}

export function evaluateStoreUpdate(currentVersion, releaseConfig) {
  if (!releaseConfig) {
    return { required: false, soft: false };
  }

  const belowMin = isVersionLessThan(currentVersion, releaseConfig.min_native_version);
  const belowLatest = isVersionLessThan(currentVersion, releaseConfig.latest_native_version);
  const required = belowMin || (releaseConfig.force_update && belowLatest);

  return {
    required,
    soft: !required && belowLatest,
  };
}
