// Wraps expo-location.
//
// Two ways to get a position:
//   - getPositionOnce() — one shot, for "where am I right now"
//   - watch() — continuous updates, for Walking Mode
//
// getPositionOnce deliberately uses watchPositionAsync with a
// short-lived subscription instead of getCurrentPositionAsync.
// On Android, getCurrentPositionAsync is a wrapper over
// FusedLocationProviderClient.getCurrentLocation(), which returns
// the OS's most recent location if it considers it "fresh enough".
// That can be a location from minutes ago, on a different network,
// several hundred metres away. watchPositionAsync starts a live
// session and delivers a real fix.

import * as Location from 'expo-location';

let _subscription = null;
let _generation = 0;

// Ask for foreground location permission.
export async function requestPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

// Get the current position once, with a timeout.
//
// Uses a short-lived watchPositionAsync instead of
// getCurrentPositionAsync so we always get a real GPS fix, not the
// OS's cached last-known position.
export async function getPositionOnce({ timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let sub = null;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (sub) {
        try {
          sub.remove();
        } catch {
          // Already removed.
        }
      }
      resolve(value);
    };

    const timer = setTimeout(() => {
      finish(null);
    }, timeoutMs);

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 0,
        // A small positive interval. Zero can behave oddly on some
        // Android versions.
        timeInterval: 500,
      },
      (loc) => {
        // Take the first fix and stop.
        finish({
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
          accuracyM: loc.coords.accuracy,
        });
      }
    )
      .then((s) => {
        sub = s;
        // If the timeout fired before the subscription was attached,
        // remove it now.
        if (settled) {
          try {
            s.remove();
          } catch {
            // Ignore.
          }
        }
      })
      .catch(() => {
        finish(null);
      });
  });
}

// Subscribe to continuous position updates. Used in Walking Mode.
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