// Reads accessibility settings and provides helpers.
//
// The two settings that matter here:
//   - largeText: scales font sizes up 30%
//   - reduceMotion: turns off animations

import { useMemo } from 'react';

import { useSettings } from '@/context/SettingsContext';
import { FONT_SIZE, LARGE_TEXT_MULTIPLIER } from '@/constants/theme';

export function useAccessibility() {
  const { settings } = useSettings();

  const multiplier = settings.largeText ? LARGE_TEXT_MULTIPLIER : 1.0;

  // A scaled copy of the font size table. Components read
  // `fonts.body` instead of `FONT_SIZE.body`.
  const fonts = useMemo(
    () => ({
      small: Math.round(FONT_SIZE.small * multiplier),
      body: Math.round(FONT_SIZE.body * multiplier),
      large: Math.round(FONT_SIZE.large * multiplier),
      title: Math.round(FONT_SIZE.title * multiplier),
      hero: Math.round(FONT_SIZE.hero * multiplier),
    }),
    [multiplier]
  );

  return {
    fonts,
    largeText: settings.largeText,
    reduceMotion: settings.reduceMotion,
    hapticsEnabled: settings.hapticsEnabled,
  };
}