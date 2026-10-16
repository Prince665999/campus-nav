// Compass heading.
//
// Sources, tried in this order:
//   1. The OS's fused heading (expo-location watchHeadingAsync). It combines
//      the magnetometer with the accelerometer, so it stays correct when the
//      phone is held tilted, which is how people hold it while walking. It
//      also corrects for magnetic declination when it knows where you are.
//   2. The raw magnetometer, used if (1) gives nothing within a few seconds.
//      Only accurate with the phone flat.
//   3. GPS direction of travel (Plan B). This file does not do that part:
//      hooks/useCompass.js feeds it in from headingFromMovement() whenever
//      no sensor heading has arrived. Phones with no magnetometer use it,
//      exactly as before.
//
// The caller gets a heading in degrees, 0 = north.

import { Magnetometer } from 'expo-sensors';
import * as Location from 'expo-location';

import { magneticHeadingFromXY, smoothHeading } from '@/utils/heading';

// If the fused heading hasn't produced a value after this long, switch to
// the raw magnetometer.
const FUSED_TIMEOUT_MS = 3000;

let _subscription = null;

// OS-fused heading. Returns a stop function, or null if unavailable.
async function tryFusedHeading(onHeading) {
  const perm = await Location.getForegroundPermissionsAsync();
  if (!perm || !perm.granted) return null;

  let last = null;
  const sub = await Location.watchHeadingAsync((h) => {
    // trueHeading is -1 when the OS can't work it out yet; then use the
    // magnetic heading (the difference is only a few degrees here).
    const raw = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
    if (!Number.isFinite(raw) || raw < 0) return;
    last = smoothHeading(last, raw);
    onHeading(last);
  });
  return () => sub.remove();
}

// Raw magnetometer. Returns a stop function, or null if unavailable.
async function tryMagnetometer(onHeading) {
  const available = await Magnetometer.isAvailableAsync();
  if (!available) return null;

  Magnetometer.setUpdateInterval(100);

  let last = null;
  const sub = Magnetometer.addListener((reading) => {
    const raw = magneticHeadingFromXY(reading.x, reading.y);
    if (Number.isFinite(raw)) {
      last = smoothHeading(last, raw, 0.2);
      onHeading(last);
    }
  });

  return () => sub.remove();
}

// Compute a heading from two GPS positions. Returns degrees or null
// if the movement is too small to get a reliable direction.
// (Plan B. Unchanged.)
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
// degrees, or null if no sensor is available.
//
// Returns a stop function.
export async function watch(onHeading, onError) {
  if (_subscription) {
    return () => stop();
  }

  let stopped = false;
  let current = null; // stop function of whichever source is live
  let timer = null;

  const emit = (h) => {
    if (!stopped) onHeading(h);
  };

  const startRaw = async () => {
    try {
      const s = await tryMagnetometer(emit);
      if (stopped) {
        if (s) s();
        return;
      }
      current = s;
      if (!s) emit(null);
    } catch (e) {
      if (onError) onError(e);
    }
  };

  try {
    let gotFused = false;
    const s = await tryFusedHeading((h) => {
      gotFused = true;
      emit(h);
    });
    if (s) {
      current = s;
      timer = setTimeout(async () => {
        if (stopped || gotFused) return;
        s();
        current = null;
        await startRaw();
      }, FUSED_TIMEOUT_MS);
    }
  } catch (e) {
    if (onError) onError(e);
  }

  if (!current) await startRaw();

  if (!current && !timer) {
    // No sensor at all. Plan B (GPS) takes over in the caller.
    _subscription = null;
    return () => {};
  }

  _subscription = {
    remove: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (current) current();
      current = null;
    },
  };
  return () => stop();
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
