// Wraps expo-location.
//
// Two ways to get a position:
//   - watch() — continuous updates, used in Walking Mode.
//   - getPositionOnce() — one shot, with a timeout, used when the app
//     needs a starting point for a route.
//
// Only one watch subscription is active at a time.

import * as Location from 'expo-location';

let _subscription = null;

// Ask for foreground location permission. Returns true if granted.
export async function requestPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

// Get the current position once, with a timeout.
//
// Returns { lat, lon, accuracyM } or null if the fix doesn't arrive
// within `timeoutMs`. A GPS fix can take several seconds on a cold
// start — the timeout prevents the caller from hanging indefinitely.
export async function getPositionOnce({ timeoutMs = 8000 } = {}) {
  try {
    const result = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (!result) return null;

    return {
      lat: result.coords.latitude,
      lon: result.coords.longitude,
      accuracyM: result.coords.accuracy,
    };
  } catch {
    return null;
  }
}

// Subscribe to continuous position updates.
//
// onPosition receives { lat, lon, accuracyM, timestamp }.
// Returns a function to stop watching.
export async function watch(onPosition, onError) {
  if (_subscription) {
    return () => stopWatching();
  }

  _subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 1,
      timeInterval: 1000,
    },
    (loc) => {
      onPosition({
        lat: loc.coords.latitude,
        lon: loc.coords.longitude,
        accuracyM: loc.coords.accuracy,
        timestamp: loc.timestamp,
      });
    },
    (err) => {
      if (onError) onError(err);
    }
  );

  return () => stopWatching();
}

export function stopWatching() {
  if (_subscription) {
    _subscription.remove();
    _subscription = null;
  }
}