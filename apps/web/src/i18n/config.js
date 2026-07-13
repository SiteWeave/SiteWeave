import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import {
  supportedLngs,
  lookupLocalStorage,
  detectBrowserLng,
  loadResourcesForLng,
  attachLazyLocaleLoader,
} from '@siteweave/i18n';

export const i18nReady = (async () => {
  const lng = detectBrowserLng();
  const resources = await loadResourcesForLng(lng);

  await i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      lng,
      fallbackLng: 'en',
      supportedLngs,
      nonExplicitSupportedLngs: true,
      interpolation: {
        escapeValue: false,
      },
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupLocalStorage,
      },
    });

  attachLazyLocaleLoader(i18n);
  return i18n;
})();

export default i18n;
