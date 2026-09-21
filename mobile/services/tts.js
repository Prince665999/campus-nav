// Text-to-speech wrapper around expo-speech.
//
// One concern here is duplicate speech: the walking screen re-renders
// on every GPS fix, but we should only speak each instruction once.
// The module remembers the last spoken text and does nothing if asked
// to speak the same thing again.

import * as Speech from 'expo-speech';

let _lastSpoken = null;

// Speak a piece of text.
//
// options.rate  — speaking rate, 0.1 to 2.0. 1.0 is normal.
// options.lang  — BCP-47 language tag, e.g. "en-US" or "sw-TZ".
// options.force — if true, speak even if this text was just spoken.
export function speak(text, options = {}) {
  const { rate = 0.95, lang = 'en-US', force = false } = options;

  if (!text) return;
  if (!force && text === _lastSpoken) return;

  _lastSpoken = text;

  Speech.speak(text, {
    rate,
    language: lang,
    // Interrupt any in-progress speech. For walking directions, the
    // most recent instruction is the relevant one.
    onDone: () => {
      // Intentionally empty. If we want a queue later, this is where.
    },
  });
}

// Stop any in-progress speech.
export function stop() {
  Speech.stop();
  _lastSpoken = null;
}

// Clear the "last spoken" memory without stopping current speech.
// Used when the instruction changes because the student turned, so
// the same words can be spoken again if they turn back.
export function reset() {
  _lastSpoken = null;
}