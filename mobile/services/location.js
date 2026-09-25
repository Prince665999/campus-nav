// Wraps expo-location.

import * as Location from 'expo-location';

let _subscription = null;
let _generation = 0;

export async function requestPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

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

export async function watch(onPosition, onError) {
  const myGeneration = ++_generation;

  if (_subscription) {
    try {
      _subscription.remove();
    } catch {
      // Already removed.
    }
    _subscription = null;
  }

  try {
    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 0,
        timeInterval: 500,
      },
      (loc) => {
        if (myGeneration !== _generation) return;
        onPosition({
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
          accuracyM: loc.coords.accuracy,
          timestamp: loc.timestamp,
        });
      },
      (err) => {
        if (myGeneration !== _generation) return;
        if (onError) onError(err);
      }
    );

    if (myGeneration !== _generation) {
      try {
        sub.remove();
      } catch {
        // Ignore.
      }
      return () => {};
    }

    _subscription = sub;
  } catch (err) {
    if (onError) onError(err);
    return () => {};
  }

  return () => stopWatching();
}

export function stopWatching() {
  _generation += 1;
  if (_subscription) {
    try {
      _subscription.remove();
    } catch {
      // Ignore.
    }
    _subscription = null;
  }
}