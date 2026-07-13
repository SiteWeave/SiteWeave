import 'intl-pluralrules';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import {
  supportedLngs,
  lookupLocalStorage,
  normalizeLng,
  loadAllLocaleResources,
  attachLazyLocaleLoader,
} from '@siteweave/i18n';

async function detectMobileLng() {
  try {
    const stored = await AsyncStorage.getItem(lookupLocalStorage);
    if (stored && supportedLngs.includes(stored)) return stored;
  } catch {
    // ignore
  }
  const deviceLang = Localization.getLocales?.()[0]?.languageCode;
  return deviceLang === 'es' ? 'es' : 'en';
}

const languageDetector = {
  type: 'languageDetector',
  async: true,
  detect: async (callback) => {
    callback(await detectMobileLng());
  },
  init: () => {},
  cacheUserLanguage: async (lng) => {
    try {
      await AsyncStorage.setItem(lookupLocalStorage, normalizeLng(lng));
    } catch {
      // ignore
    }
  },
};

export const i18nReady = (async () => {
  if (i18n.isInitialized) return i18n;

  const lng = normalizeLng(await detectMobileLng());
  const resources = await loadAllLocaleResources();

  await i18n
    .use(languageDetector)
    .use(initReactI18next)
    .init({
      resources,
      lng,
      fallbackLng: 'en',
      supportedLngs,
      nonExplicitSupportedLngs: true,
      load: 'languageOnly',
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });

  attachLazyLocaleLoader(i18n);
  return i18n;
})();

export default i18n;
