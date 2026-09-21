// Subscribes to device orientation and yields a compass heading in
// degrees (0 = north, 90 = east).
//
// The data source differs by platform:
//   iOS:     Magnetometer gives a compass-like value directly.
//   Android: Magnetometer + Accelerometer fused for a reliable heading.
//
// We use expo-sensors' Magnetometer on both, with a small amount of
// smoothing, because it's the same API on both platforms and the
// accuracy is sufficient for a walking app.

import { Magnetometer } from 'expo-sensors';

let _subscription = null;

// Convert a magnetometer reading to a compass heading in degrees.
//
// The magnetometer gives (x, y, z) in microteslas. For a phone held
// flat, the heading is derived from x and y. The formula below is
// the standard one, adjusted so that 0 is north.
function readingToHeading({ x, y }) {
  const angle = Math.atan2(y, x) * (180 / Math.PI);
  return (angle + 360) % 360;
}

// Apply exponential smoothing to reduce jitter.
//
// New reading weighted 0.2, previous heading weighted 0.8. This makes
// the arrow steady without introducing noticeable lag.
function smooth(prev, next) {
  if (prev === null) return next;
  // Handle the wrap-around at 0/360 so 359 -> 1 doesn't average to 180.
  let diff = next - prev;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (prev + diff * 0.2 + 360) % 360;
}

// Subscribe to heading updates.
//
// onHeading receives a smoothed compass heading in degrees.
// Returns a function that stops the subscription.
export async function watch(onHeading, onError) {
  if (_subscription) {
    return () => stop();
  }

  const available = await Magnetometer.isAvailableAsync();
  if (!available) {
    if (onError) onError(new Error('Magnetometer not available on this device'));
    return () => {};
  }

  // 100ms interval is 10 Hz. Enough for a smooth arrow without
  // draining the battery.
  Magnetometer.setUpdateInterval(100);

  let lastHeading = null;

  _subscription = Magnetometer.addListener((reading) => {
    const raw = readingToHeading(reading);
    lastHeading = smooth(lastHeading, raw);
    onHeading(lastHeading);
  });

  return () => stop();
}

export function stop() {
  if (_subscription) {
    _subscription.remove();
    _subscription = null;
  }
}