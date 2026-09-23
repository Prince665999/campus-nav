// Haptic feedback.
//
// Used for:
//   - A pulse when the student reaches a turn (stronger)
//   - A subtle pulse when a step advances (lighter)
//   - Feedback on favourite toggle
//
// expo-haptics is a native module that's already in the app's build.
// If the device doesn't have a haptic engine, the calls are silent
// no-ops.

import * as Haptics from 'expo-haptics';

let _enabled = true;

export function setEnabled(enabled) {
  _enabled = !!enabled;
}

export async function turnPulse() {
  if (!_enabled) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // No haptic engine. Silent.
  }
}

export async function stepPulse() {
  if (!_enabled) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Silent.
  }
}

export async function arrivalPulse() {
  if (!_enabled) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Silent.
  }
}

export async function offRoutePulse() {
  if (!_enabled) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Silent.
  }
}