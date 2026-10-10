// Determines where a route should start from.
//
// Priority order:
//   1. A fresh GPS fix — unless it looks "suspicious" (near a
//      building entrance, or accuracy worse than 25 m). In that
//      case the caller is told to ask "are you inside?".
//   2. If GPS fails or is refused: the outdoor place picker.
//
// Two invariants this hook maintains:
//
//   - `start` holds ONLY a deliberate choice — a place or a door the
//     student picked. It is never set from a raw GPS fix. GPS fixes
//     are returned to the caller, not stored. This prevents a stale
//     fix from being reused on a later route after the student has
//     walked elsewhere.
//
//   - `resolveStart` returns a discriminated status object. Callers
//     branch on the return value, not on the hook's state, because
//     React state updates are asynchronous and reading `state` right
//     after `await resolveStart(...)` would read the previous value.

import { useCallback, useRef, useState } from 'react';

import { getPositionOnce, requestPermission } from '@/services/location';
import { listPlaces, listEntrances } from '@/services/api';

const GPS_TIMEOUT_MS = 15000;
const NEAR_ENTRANCE_M = 20;
const ACCURACY_THRESHOLD_M = 25;

// Distance in metres between two lat/lon points.
function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function useStartingPoint() {
  const [state, setState] = useState('idle');
  const [start, setStart] = useState(null);
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [lastError, setLastError] = useState(null);

  // The building the fix is near, if any. Used by AreYouInsideSheet
  // to name the building in the question.
  const [suspiciousBuilding, setSuspiciousBuilding] = useState(null);
  const [suspiciousFix, setSuspiciousFix] = useState(null);

  const pendingResolverRef = useRef(null);

  // Reset clears transient state only — the failure flags, the
  // suspicious fix, and the internal state machine. It deliberately
  // does NOT clear `start` or `nearbyPlaces`, because those are the
  // student's deliberate choices and shouldn't be wiped just because
  // they opened the chip or backed out of a sheet.
  const reset = useCallback(() => {
    setState('idle');
    setLastError(null);
    setSuspiciousBuilding(null);
    setSuspiciousFix(null);
    if (pendingResolverRef.current) {
      pendingResolverRef.current(null);
      pendingResolverRef.current = null;
    }
  }, []);

  // Explicitly forget the chosen start. Called when the student picks
  // "Use my current location" — the next route should do a fresh GPS
  // read, not reuse a place they picked five minutes ago.
  const forgetStart = useCallback(() => {
    setStart(null);
  }, []);

  // Load the outdoor place list into `nearbyPlaces`. The caller passes
  // `excludePlaceId` to hide the destination from the starting-point
  // list — you can't start from where you're going.
  const loadOutdoorPlaces = useCallback(async ({ excludePlaceId } = {}) => {
    try {
      const places = await listPlaces({ kind: 'outdoor', limit: 100 });
      const filtered =
        excludePlaceId != null
          ? places.filter((p) => p.id !== excludePlaceId)
          : places;
      setNearbyPlaces(filtered);
    } catch {
      setNearbyPlaces([]);
    }
  }, []);

  const choosePlace = useCallback((place) => {
    const chosen = {
      placeId: place.id,
      placeName: place.name,
      buildingName: place.building_name || null,
      level: place.level || null,
      lat: place.lat ?? place.location?.lat ?? null,
      lon: place.lon ?? place.location?.lon ?? null,
    };
    setStart(chosen);
    setState('idle');
    setNearbyPlaces([]);
    if (pendingResolverRef.current) {
      pendingResolverRef.current(chosen);
      pendingResolverRef.current = null;
    }
  }, []);

  const cancelPick = useCallback(() => {
    setState('idle');
    setNearbyPlaces([]);
    if (pendingResolverRef.current) {
      pendingResolverRef.current(null);
      pendingResolverRef.current = null;
    }
  }, []);

  // The student answered "yes, I'm inside". Opens the door picker.
  const startDoorPick = useCallback(async ({ buildingName } = {}) => {
    setState('pickingDoor');
    setSuspiciousBuilding(buildingName || null);
  }, []);

  // The student answered "no, I'm outside". Return the fix so the
  // caller can route from it. Does NOT store the fix in `start`.
  const confirmOutside = useCallback(() => {
    const fix = suspiciousFix;
    setSuspiciousBuilding(null);
    setSuspiciousFix(null);
    setState('idle');
    if (fix) {
      return { lat: fix.lat, lon: fix.lon, accuracyM: fix.accuracyM };
    }
    return null;
  }, [suspiciousFix]);

  /**
   * Resolve where to start a route.
   *
   * Returns one of:
   *   { status: 'ok',       start: { lat, lon, accuracyM } }
   *   { status: 'ok_place', start: { placeId, placeName, ... } }
   *   { status: 'ask',      buildingName }
   *   { status: 'pick' }
   *   { status: 'denied',   reason }
   *
   * The caller branches on `status`. The hook's internal `state`
   * also updates so the sheets (which read it) show the right thing.
   */
  const resolveStart = useCallback(
    async ({ destinationPlaceId } = {}) => {
      setLastError(null);
      setSuspiciousBuilding(null);
      setSuspiciousFix(null);

      // If a place was already deliberately chosen, reuse it.
      if (start && start.placeId != null) {
        setState('idle');
        return { status: 'ok_place', start };
      }

      setState('locating');

      let granted = false;
      try {
        granted = await requestPermission();
      } catch {
        setLastError('permission_error');
        setState('idle');
        return { status: 'denied', reason: 'permission_error' };
      }

      if (!granted) {
        setLastError('permission_denied');
        setState('idle');
        return { status: 'denied', reason: 'permission_denied' };
      }

      let fresh = null;
      try {
        fresh = await getPositionOnce({ timeoutMs: GPS_TIMEOUT_MS });
      } catch {
        fresh = null;
      }

      if (fresh) {
        const suspicious = await checkSuspicious(fresh);

        if (suspicious) {
          setSuspiciousFix(fresh);
          const buildingName = suspicious.buildingName || null;
          setSuspiciousBuilding(buildingName);
          setState('askIndoor');
          return { status: 'ask', buildingName };
        }

        setState('idle');
        return {
          status: 'ok',
          start: {
            lat: fresh.lat,
            lon: fresh.lon,
            accuracyM: fresh.accuracyM,
          },
        };
      }

      // GPS failed. Fall back to the outdoor place picker.
      setLastError('no_fix');
      setState('needPick');
      try {
        const places = await listPlaces({ kind: 'outdoor', limit: 100 });
        const filtered =
          destinationPlaceId != null
            ? places.filter((p) => p.id !== destinationPlaceId)
            : places;
        setNearbyPlaces(filtered);
      } catch {
        setNearbyPlaces([]);
      }

      return { status: 'pick' };
    },
    [start]
  );

  return {
    state,
    start,
    nearbyPlaces,
    lastError,
    suspiciousBuilding,
    resolveStart,
    choosePlace,
    cancelPick,
    startDoorPick,
    confirmOutside,
    loadOutdoorPlaces,
    forgetStart,
    reset,
  };
}

/**
 * Returns null if the fix looks fine (route from GPS), or an object
 * `{ reason, buildingName }` if it looks suspicious.
 *
 * Two triggers:
 *   - fix is within 20 m of any building entrance
 *   - accuracy worse than 25 m
 */
async function checkSuspicious(fix) {
  if (!fix) return null;

  if (fix.accuracyM != null && fix.accuracyM > ACCURACY_THRESHOLD_M) {
    return { reason: 'accuracy', buildingName: null };
  }

  try {
    const entrances = await listEntrances();
    let nearest = null;
    let nearestDist = Infinity;
    for (const e of entrances) {
      const lat = e.location?.lat;
      const lon = e.location?.lon;
      if (lat == null || lon == null) continue;
      const d = haversineM(fix.lat, fix.lon, lat, lon);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = e;
      }
    }
    if (nearest && nearestDist <= NEAR_ENTRANCE_M) {
      return {
        reason: 'entrance',
        buildingName: nearest.building_name || null,
      };
    }
  } catch {
    // Entrance lookup failed — skip the entrance trigger.
  }

  return null;
}