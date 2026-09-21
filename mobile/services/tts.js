// Text-to-speech wrapper around expo-speech.
//
// One concern here is duplicate speech: the walking screen re-renders
// on every GPS fix, but we should only speak each instruction once.
// The module remembers the last spoken text and does nothing if asked
// to speak the same thing again.
//
// The language is passed per call, so the caller decides — usually
// via ttsLanguageForCurrentLang() from the i18n module.

import * as Speech from 'expo-speech';

let _lastSpoken = null;

export function speak(text, options = {}) {
  const { rate = 0.95, lang = 'en-US', force = false } = options;

  if (!text) return;
  if (!force && text === _lastSpoken) return;

  _lastSpoken = text;

  Speech.speak(text, {
    rate,
    language: lang,
  });
}

export function stop() {
  Speech.stop();
  _lastSpoken = null;
}

export function reset() {
  _lastSpoken = null;
}