import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HOME_SCREEN_WIDGETS_ENABLED } from './widgetFeatureFlags';
import {
  WIDGET_STORAGE_KEY,
  buildWidgetSnapshot,
  buildLoggedOutWidgetSnapshot,
  mergeWidgetSnapshots,
} from './widgetSnapshot';

async function persistSnapshotJson(json) {
  await AsyncStorage.setItem(WIDGET_STORAGE_KEY, json);
}

async function readSnapshotJson() {
  try {
    return await AsyncStorage.getItem(WIDGET_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function reloadAndroidWidgets() {
  if (!HOME_SCREEN_WIDGETS_ENABLED || Platform.OS !== 'android') return;

  try {
    const { requestWidgetUpdate } = require('react-native-android-widget');
    const {
      renderSiteBriefWidget,
      renderSiteBriefSmallWidget,
    } = require('../widget-android/render-site-brief-widget');

    await Promise.all([
      requestWidgetUpdate({
        widgetName: 'SiteBrief',
        renderWidget: renderSiteBriefWidget,
      }),
      requestWidgetUpdate({
        widgetName: 'SiteBriefSmall',
        renderWidget: renderSiteBriefSmallWidget,
      }),
    ]);
  } catch (error) {
    if (__DEV__) {
      console.warn('[widget] Android reload failed', error);
    }
  }
}

export async function readWidgetSnapshot() {
  if (!HOME_SCREEN_WIDGETS_ENABLED) return null;
  const raw = await readSnapshotJson();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeWidgetSnapshot(snapshot) {
  if (!HOME_SCREEN_WIDGETS_ENABLED) return;
  const json = JSON.stringify(snapshot);
  await persistSnapshotJson(json);
  await reloadAndroidWidgets();
}

export async function patchWidgetSnapshot(patch) {
  if (!HOME_SCREEN_WIDGETS_ENABLED) return null;
  const existing = await readWidgetSnapshot();
  const nextPatch = {
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const merged = existing
    ? mergeWidgetSnapshots(existing, nextPatch)
    : buildWidgetSnapshot(nextPatch);
  await writeWidgetSnapshot(merged);
  return merged;
}

export async function clearWidgetSnapshot() {
  if (!HOME_SCREEN_WIDGETS_ENABLED) return;
  const loggedOut = buildLoggedOutWidgetSnapshot();
  await writeWidgetSnapshot(loggedOut);
}

export async function getWidgetSnapshotForTaskHandler() {
  if (!HOME_SCREEN_WIDGETS_ENABLED) return buildLoggedOutWidgetSnapshot();
  return readWidgetSnapshot();
}
