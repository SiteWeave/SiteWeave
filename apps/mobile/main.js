import '@expo/metro-runtime';
import { Platform } from 'react-native';
import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';

renderRootComponent(App);

if (Platform.OS === 'android') {
  try {
    // Android-only native module — must not load on iOS (Expo Go / dev client).
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./widget-android/widget-task-handler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (error) {
    if (__DEV__) {
      console.warn('[widget] could not register Android widget handler', error);
    }
  }
}
