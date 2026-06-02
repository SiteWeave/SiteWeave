import 'intl-pluralrules';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { resources, supportedLngs, lookupLocalStorage } from '@siteweave/i18n';

const languageDetector = {
  type: 'languageDetector',
  async: true,
  detect: async (callback) => {
    try {
      const stored = await AsyncStorage.getItem(lookupLocalStorage);
      if (stored) {
        callback(stored);
        return;
      }
    } catch {
      // ignore
    }
    const deviceLang = Localization.getLocales?.()[0]?.languageCode;
    callback(deviceLang === 'es' ? 'es' : 'en');
  },
  init: () => {},
  cacheUserLanguage: async (lng) => {
    try {
      await AsyncStorage.setItem(lookupLocalStorage, lng);
    } catch {
      // ignore
    }
  },
};

if (!i18n.isInitialized) {
  i18n
    .use(languageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: 'en',
      supportedLngs,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });
}

export default i18n;
