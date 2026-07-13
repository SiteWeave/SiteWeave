import { supportedLngs, defaultNS, lookupLocalStorage } from './constants.js';

export function normalizeLng(lng) {
  if (!lng) return 'en';
  const base = String(lng).split('-')[0].toLowerCase();
  return supportedLngs.includes(base) ? base : 'en';
}

export async function loadLocaleTranslation(lng) {
  const normalized = normalizeLng(lng);
  if (normalized === 'es') {
    return (await import('./locales/es.json')).default;
  }
  return (await import('./locales/en.json')).default;
}

export async function loadResourcesForLng(lng) {
  const normalized = normalizeLng(lng);
  const translation = await loadLocaleTranslation(normalized);
  return { [normalized]: { [defaultNS]: translation } };
}

/** Load every supported locale (used by mobile where bundle size is acceptable). */
export async function loadAllLocaleResources() {
  const entries = await Promise.all(
    supportedLngs.map(async (lng) => {
      const translation = await loadLocaleTranslation(lng);
      return [lng, { [defaultNS]: translation }];
    }),
  );
  return Object.fromEntries(entries);
}

/** Ensure a locale bundle is present and complete before switching languages. */
export async function ensureLocaleLoaded(i18nInstance, lng) {
  const normalized = normalizeLng(lng);
  const translation = await loadLocaleTranslation(normalized);
  i18nInstance.addResourceBundle(normalized, defaultNS, translation, true, true);
  return normalized;
}

export function detectBrowserLng() {
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(lookupLocalStorage);
      if (stored && supportedLngs.includes(stored)) return stored;
    } catch {
      // ignore
    }
  }
  if (typeof navigator !== 'undefined') {
    const nav = navigator.language || navigator.userLanguage;
    if (nav && nav.toLowerCase().startsWith('es')) return 'es';
  }
  return 'en';
}

export function attachLazyLocaleLoader(i18nInstance) {
  i18nInstance.on('languageChanged', async (lng) => {
    await ensureLocaleLoaded(i18nInstance, lng);
  });
}
