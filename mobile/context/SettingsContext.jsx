// App-wide settings that persist across restarts.
//
// The `loaded` flag is important for onboarding: the Home screen
// waits until settings are read from storage before deciding whether
// to redirect. Without it, the redirect would fire on the very first
// render (before storage is read) and return visitors would see the
// onboarding flow every time.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { getJSON, setJSON } from '@/services/storage';
import { setLanguage as setI18nLanguage } from '@/i18n';

const STORAGE_KEY = 'campus-nav-settings-v1';

const DEFAULT_SETTINGS = {
  voiceEnabled: true,
  voiceRate: 0.95,
  units: 'metric',
  language: 'en',
  wifiProximityEnabled: true,
  largeText: false,
  hapticsEnabled: true,
  reduceMotion: false,
  hasSeenOnboarding: false,
};

const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  updateSetting: () => {},
  loaded: false,
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJSON(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        const merged = { ...DEFAULT_SETTINGS, ...(stored || {}) };
        setSettings(merged);
        setI18nLanguage(merged.language);
        setLoaded(true);
      })
      .catch(() => {
        // Storage failed. Use defaults and mark as loaded so the
        // app doesn't hang waiting.
        if (cancelled) return;
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      setJSON(STORAGE_KEY, next);

      // Language is special: it has a side effect on the i18n module.
      if (key === 'language') {
        setI18nLanguage(value);
      }

      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, loaded }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}