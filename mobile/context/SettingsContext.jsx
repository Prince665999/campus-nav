// App-wide settings that persist across restarts.
//
// Usage:
//   const { settings, updateSetting } = useSettings();
//   settings.voiceEnabled // true or false
//   settings.language     // 'en' or 'sw'

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
};

const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  updateSetting: () => {},
  loaded: false,
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Load persisted settings on mount.
  useEffect(() => {
    let cancelled = false;
    getJSON(STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      const merged = { ...DEFAULT_SETTINGS, ...(stored || {}) };
      setSettings(merged);
      // Apply the persisted language to the i18n module immediately.
      setI18nLanguage(merged.language);
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