import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { te } from './te';
import type { Locale } from '../types';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}

const STORAGE_KEY = 'im.locale';

export function storedLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'te' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

export function setLocale(locale: Locale) {
  try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* private mode */ }
  document.documentElement.lang = locale;
  void i18n.changeLanguage(locale);
}

export function initI18n() {
  const lng = storedLocale() ?? 'te';
  document.documentElement.lang = lng;
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, te: { translation: te } },
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18n;
}

export { i18n, en, te };
