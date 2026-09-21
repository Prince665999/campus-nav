// App-wide settings that persist across restarts.
//
// Usage:
//   const { settings, updateSetting } = useSettings();
//   settings.voiceEnabled // true or false

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { getJSON, setJSON } from '@/services/storage';

const STORAGE_KEY = 'campus-nav-settings-v1';

const DEFAULT_SETTINGS = {
  voiceEnabled: true,
  voiceRate: 0.95,
  units: 'metric',
  wifiProximityEnabled: true,
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
      if (stored) setSettings({ ...DEFAULT_SETTINGS, ...stored });
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