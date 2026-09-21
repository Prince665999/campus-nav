// i18n helper. No library, just lookups.
//
// Usage in a component:
//   import { t } from '@/i18n';
//   <Text>{t('home.title')}</Text>
//
// Interpolation:
//   t('walking.approaching', { name: 'Library' })
//
// The current language is set once by the Settings context on app
// start and whenever the student changes it.

import en from './en.json';
import sw from './sw.json';

const TRANSLATIONS = {
  en,
  sw,
};

export const AVAILABLE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'sw', label: 'Kiswahili' },
];

let _currentLang = 'en';

export function setLanguage(lang) {
  if (TRANSLATIONS[lang]) {
    _currentLang = lang;
  }
}

export function getLanguage() {
  return _currentLang;
}

function lookup(key, lang) {
  const parts = key.split('.');
  let node = TRANSLATIONS[lang];
  for (const p of parts) {
    if (node == null) return null;
    node = node[p];
  }
  return typeof node === 'string' ? node : null;
}

export function t(key, params) {
  let value = lookup(key, _currentLang);

  // Fall back to English if the key is missing in the current language.
  if (value == null && _currentLang !== 'en') {
    value = lookup(key, 'en');
  }

  // Fall back to the key itself so missing translations are visible
  // rather than blank.
  if (value == null) {
    return key;
  }

  // {placeholder} interpolation.
  if (params) {
    value = value.replace(/\{(\w+)\}/g, (match, name) => {
      return params[name] != null ? String(params[name]) : match;
    });
  }

  return value;
}

// TTS language codes. The phone's text-to-speech engine picks a
// voice based on these. Falls back to the base language code if the
// country-specific one isn't available — the engine handles that
// automatically.
export function ttsLanguageForCurrentLang() {
  if (_currentLang === 'sw') return 'sw-TZ';
  return 'en-TZ';
}