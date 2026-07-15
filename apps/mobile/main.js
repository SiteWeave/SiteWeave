import '@expo/metro-runtime';
import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { HOME_SCREEN_WIDGETS_ENABLED } from './utils/widgetFeatureFlags';

renderRootComponent(App);

// TEMP: Android home-screen widget task handler disabled for store submit.
if (HOME_SCREEN_WIDGETS_ENABLED) {
  const { Platform } = require('react-native');
  if (Platform.OS === 'android') {
    try {
      const { registerWidgetTaskHandler } = require('react-native-android-widget');
      const { widgetTaskHandler } = require('./widget-android/widget-task-handler');
      registerWidgetTaskHandler(widgetTaskHandler);
    } catch (error) {
      if (__DEV__) {
        console.warn('[widget] could not register Android widget handler', error);
      }
    }
  }
}
