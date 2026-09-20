// Wraps expo-location.
//
// Only one subscription is active at a time. Calling watch() while
// another watch is running returns the existing subscription rather
// than starting a second one — the OS warns loudly if you subscribe
// twice.

import * as Location from 'expo-location';

let _subscription = null;

// Ask for foreground location permission. Returns true if granted.
//
// Safe to call more than once — if permission is already granted, it
// returns true without showing a prompt.
export async function requestPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

// Get the current position once.
export async function getCurrentPosition() {
  return Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
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
      // Wait at least 1 metre of movement before reporting. Filters
      // out GPS drift while the student is standing still.
      distanceInterval: 1,
      // Report at most once per second. Balances freshness against
      // battery drain.
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