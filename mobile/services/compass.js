// Compass heading.
//
// Two sources, in order:
//   1. The magnetometer — accurate when it works. Some phones have
//      it, some don't.
//   2. The GPS direction of travel — less accurate, only works while
//      moving, but always available when a fix is being received.
//
// The caller gets a heading in degrees, 0 = north. The source is
// included so the caller can decide whether to trust it.

import { Magnetometer } from 'expo-sensors';

let _subscription = null;

// Convert a magnetometer reading to a compass heading.
function readingToHeading({ x, y }) {
  const angle = Math.atan2(y, x) * (180 / Math.PI);
  return (angle + 360) % 360;
}

// Smooth a heading, handling the 0/360 wrap-around.
function smooth(prev, next) {
  if (prev === null || prev === undefined) return next;
  let diff = next - prev;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (prev + diff * 0.2 + 360) % 360;
}

// Try to subscribe to the magnetometer.
// Returns a stop function on success, or null if unavailable.
async function tryMagnetometer(onHeading) {
  const available = await Magnetometer.isAvailableAsync();
  if (!available) return null;

  Magnetometer.setUpdateInterval(100);

  let last = null;
  const sub = Magnetometer.addListener((reading) => {
    const raw = readingToHeading(reading);
    if (Number.isFinite(raw)) {
      last = smooth(last, raw);
      onHeading(last);
    }
  });

  return () => sub.remove();
}

// Compute a heading from two GPS positions. Returns degrees or null
// if the movement is too small to get a reliable direction.
export function headingFromMovement(prev, next) {
  if (!prev || !next) return null;

  const dLat = next.lat - prev.lat;
  const dLon = next.lon - prev.lon;

  // Ignore tiny movements — GPS jitter would give random headings.
  // 0.00001 degrees is about 1 metre.
  if (Math.abs(dLat) < 0.00001 && Math.abs(dLon) < 0.00001) {
    return null;
  }

  const phi1 = (prev.lat * Math.PI) / 180;
  const phi2 = (next.lat * Math.PI) / 180;
  const dLambda = (dLon * Math.PI) / 180;

  const x = Math.sin(dLambda) * Math.cos(phi2);
  const y =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

// Subscribe to heading updates. The callback receives a heading in
// degrees, or null if no source is available.
//
// Returns a stop function.
export async function watch(onHeading, onError) {
  if (_subscription) {
    return () => stop();
  }

  let magnetometerStop = null;
  try {
    magnetometerStop = await tryMagnetometer(onHeading);
  } catch (e) {
    if (onError) onError(e);
  }

  if (magnetometerStop) {
    _subscription = { remove: magnetometerStop };
    return () => stop();
  }

  // No magnetometer. The caller will need to feed GPS-derived
  // headings in manually — see headingFromMovement above.
  // Report null so the caller knows there's no sensor.
  if (onHeading) onHeading(null);
  _subscription = null;
  return () => {};
}

export function stop() {
  if (_subscription) {
    _subscription.remove();
    _subscription = null;
  }
}

// Whether a magnetometer is available on this device.
// Callers use this to know whether to expect real headings or to
// fall back to GPS-derived ones.
export async function hasMagnetometer() {
  try {
    return await Magnetometer.isAvailableAsync();
  } catch {
    return false;
  }
}