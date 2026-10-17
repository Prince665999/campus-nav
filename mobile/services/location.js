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

// How good a fix has to be before we stop waiting for a better one.
// Tune these three numbers if the wait feels too long or the start point
// too rough.
const GOOD_ACCURACY_M = 20; // stop at once when a fix is this good
const OK_ACCURACY_M = 40; // after SOFT_WAIT_MS, this is good enough
const SOFT_WAIT_MS = 7000;

// Get the current position once.
//
// The first fix a phone reports after its GPS wakes up is often a rough
// one, 80-100 m off (it comes from Wi-Fi / mobile towers). A few seconds
// later the GPS settles to 2-5 m. Taking the first fix, as this function
// used to, meant routes started from a point up to 100 m away.
//
// Now it keeps listening and keeps the BEST fix (smallest accuracy
// radius):
//   - returns immediately once a fix is within GOOD_ACCURACY_M;
//   - after SOFT_WAIT_MS, accepts a fix within OK_ACCURACY_M;
//   - at timeoutMs, returns the best fix it saw (null if none).
//
// Uses watchPositionAsync rather than getCurrentPositionAsync so we get
// live fixes, not the OS's cached last-known position.
export async function getPositionOnce({
  timeoutMs = 15000,
  onProgress = null,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let sub = null;
    let best = null;
    const startedAt = Date.now();

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(softTimer);
      if (sub) {
        try {
          sub.remove();
        } catch {
          // Already removed.
        }
      }
      resolve(value);
    };

    // Hard limit: give back the best we have.
    const timer = setTimeout(() => finish(best), timeoutMs);

    // Soft limit: an OK fix is enough once we have waited a while.
    const softTimer = setTimeout(() => {
      if (best && best.accuracyM != null && best.accuracyM <= OK_ACCURACY_M) {
        finish(best);
      }
    }, SOFT_WAIT_MS);

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 0,
        // A small positive interval. Zero can behave oddly on some
        // Android versions.
        timeInterval: 500,
      },
      (loc) => {
        const fix = {
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
          accuracyM: loc.coords.accuracy,
        };
        const acc = fix.accuracyM;
        const better =
          !best ||
          (acc != null && (best.accuracyM == null || acc < best.accuracyM));
        if (better) best = fix;

        if (onProgress) {
          try {
            onProgress(best, Date.now() - startedAt);
          } catch {
            // The callback must never break location.
          }
        }

        if (acc != null && acc <= GOOD_ACCURACY_M) {
          finish(fix);
        } else if (
          Date.now() - startedAt >= SOFT_WAIT_MS &&
          best.accuracyM != null &&
          best.accuracyM <= OK_ACCURACY_M
        ) {
          finish(best);
        }
      }
    )
      .then((s) => {
        sub = s;
        // If we finished before the subscription was attached, remove it
        // now.
        if (settled) {
          try {
            s.remove();
          } catch {
            // Ignore.
          }
        }
      })
      .catch(() => {
        finish(best);
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

