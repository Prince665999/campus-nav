// Wi-Fi connection helper.
//
// Two paths:
//
//   1. Native suggestion — where the OS supports it, hand the
//      network name and password to the system, and the student
//      confirms a system prompt.
//
//   2. Clipboard — where the OS doesn't support suggestion, copy
//      the password and let the student paste it in manually.
//
// The app tries (1) first, falls back to (2). Both are one tap from
// the student's point of view.

import * as Clipboard from 'expo-clipboard';
import { Linking, Platform } from 'react-native';

// Result of a connect attempt.
//   "suggested" — handed off to the OS suggestion flow
//   "copied"    — password copied to clipboard
//   "nothing"   — no password and no network to suggest (open network)
//   "failed"    — something went wrong
export const CONNECT_RESULTS = {
  SUGGESTED: 'suggested',
  COPIED: 'copied',
  NOTHING: 'nothing',
  FAILED: 'failed',
};

/**
 * Attempt to connect to a Wi-Fi network.
 *
 * On Android and iOS, `Linking.openURL` can hand a `wifi://` URL to
 * the system, which prompts the user to join the network with the
 * password pre-filled. This is the closest thing to a native
 * suggestion the OS exposes to a JavaScript app.
 *
 * If that fails, we copy the password to the clipboard.
 */
export async function connectToNetwork(spot) {
  if (!spot || !spot.ssid) {
    return CONNECT_RESULTS.NOTHING;
  }

  // ---- Attempt 1: the native suggestion flow ----
  if (spot.password) {
    try {
      // Android's Wi-Fi connect intent. This URL scheme is not
      // officially documented by Google but is well-supported on
      // Android 10+ and shows a confirmation prompt to the user.
      //
      // On iOS, the same scheme is generally not honoured, so we
      // skip straight to the clipboard fallback.
      if (Platform.OS === 'android') {
        // Encode the SSID and password in the URL.
        const url =
          `wifi://${encodeURIComponent(spot.ssid)}` +
          `?password=${encodeURIComponent(spot.password)}`;
        const supported = await Linking.canOpenURL(url).catch(() => false);
        if (supported) {
          await Linking.openURL(url);
          return CONNECT_RESULTS.SUGGESTED;
        }
      }
    } catch {
      // Fall through to clipboard.
    }
  }

  // ---- Attempt 2: copy the password ----
  if (spot.password) {
    try {
      await Clipboard.setStringAsync(spot.password);
      return CONNECT_RESULTS.COPIED;
    } catch {
      return CONNECT_RESULTS.FAILED;
    }
  }

  // ---- No password, no suggestion — the network might be open ----
  return CONNECT_RESULTS.NOTHING;
}

/**
 * Return the message the banner should show after a connect attempt.
 * Kept here so the banner and any other caller agree on the wording.
 */
export function messageForResult(result, ssid) {
  switch (result) {
    case CONNECT_RESULTS.SUGGESTED:
      return `Confirm the connection to "${ssid}" in the prompt.`;
    case CONNECT_RESULTS.COPIED:
      return `Password copied. Open Settings → Wi-Fi and connect to "${ssid}".`;
    case CONNECT_RESULTS.NOTHING:
      return `Connect to "${ssid}" from Settings → Wi-Fi.`;
    case CONNECT_RESULTS.FAILED:
    default:
      return `Couldn't connect. Open Settings → Wi-Fi to join "${ssid}".`;
  }
}