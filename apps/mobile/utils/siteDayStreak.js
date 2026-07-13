import AsyncStorage from '@react-native-async-storage/async-storage';
import { todayIso } from '@siteweave/core-logic';

const KEY_PREFIX = 'siteweave_site_day_streak_dates';

function storageKey(userId) {
  return `${KEY_PREFIX}:${userId}`;
}

export function computeStreakFromDates(dates = [], today = todayIso()) {
  if (!dates?.length) return 0;
  const set = new Set(dates);
  const cursor = new Date(`${today}T12:00:00`);
  let streak = 0;
  for (let i = 0; i < 366; i += 1) {
    const iso = cursor.toISOString().split('T')[0];
    if (!set.has(iso)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function recordSiteDayPost(userId) {
  if (!userId) return;
  const today = todayIso();
  const key = storageKey(userId);
  const raw = await AsyncStorage.getItem(key);
  const dates = raw ? JSON.parse(raw) : [];
  if (dates.includes(today)) return;
  const next = [...dates, today].sort().slice(-90);
  await AsyncStorage.setItem(key, JSON.stringify(next));
}

export async function getSiteDayStreak(userId) {
  if (!userId) return 0;
  const raw = await AsyncStorage.getItem(storageKey(userId));
  const dates = raw ? JSON.parse(raw) : [];
  return computeStreakFromDates(dates);
}
