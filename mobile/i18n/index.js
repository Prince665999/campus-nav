// Tiny i18n helper. No library, just a lookup.
//
// Usage in a component:
//   import { t } from '@/i18n';
//   <Text>{t('home.title')}</Text>
//
// Interpolation:
//   t('route.estimatedTime', { minutes: 12 })
//
// Currently only English is loaded. Phase 9 adds a language toggle
// and loads sw.json instead when the user picks Kiswahili.

import en from './en.json';

const TRANSLATIONS = {
  en,
};

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

  // Simple {placeholder} interpolation.
  if (params) {
    value = value.replace(/\{(\w+)\}/g, (match, name) => {
      return params[name] != null ? String(params[name]) : match;
    });
  }

  return value;
}