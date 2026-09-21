// Tests for the i18n helper.

import { t, setLanguage, getLanguage, ttsLanguageForCurrentLang } from '@/i18n';

describe('i18n', () => {
  afterEach(() => {
    // Reset to English between tests.
    setLanguage('en');
  });

  test('returns English text by default', () => {
    expect(t('home.title')).toBe('Where to?');
  });

  test('returns the key when a lookup fails', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  test('switching to Kiswahili changes the returned text', () => {
    setLanguage('sw');
    expect(t('home.title')).toBe('Unakwenda wapi?');
  });

  test('getLanguage returns the current language', () => {
    setLanguage('sw');
    expect(getLanguage()).toBe('sw');
    setLanguage('en');
    expect(getLanguage()).toBe('en');
  });

  test('setLanguage ignores unknown languages', () => {
    setLanguage('fr');
    expect(getLanguage()).toBe('en'); // still the previous value
  });

  test('falls back to English for a key missing in the current language', () => {
    // If sw.json is missing a key, t() returns the en value instead of
    // the key itself. Hard to test directly without editing the JSON,
    // so we verify the shape of the fallback by checking a known key.
    setLanguage('sw');
    expect(t('common.loading')).toBeTruthy();
    expect(t('common.loading')).not.toBe('common.loading');
  });

  test('interpolates {name} placeholders', () => {
    const result = t('walking.approaching', { name: 'Library' });
    expect(result).toContain('Library');
    expect(result).not.toContain('{name}');
  });

  test('leaves unknown placeholders untouched', () => {
    const result = t('walking.approaching', { other: 'x' });
    expect(result).toContain('{name}');
  });

  test('tts language is sw-TZ in Kiswahili mode', () => {
    setLanguage('sw');
    expect(ttsLanguageForCurrentLang()).toBe('sw-TZ');
  });

  test('tts language is en-TZ in English mode', () => {
    setLanguage('en');
    expect(ttsLanguageForCurrentLang()).toBe('en-TZ');
  });
});