// Determines where a route should start from.
//
// The logic, in order:
//   1. If the app has a position from the last few minutes (from
//      Walking Mode or a previous request), use it.
//   2. Otherwise, ask for permission and try to get a fresh fix.
//   3. If permission is denied, or the fix doesn't arrive, ask the
//      student which place they're starting from.
//
// The caller gets a result that says either "we have a start" (with
// the coordinates or a chosen place) or "we need you to pick".

import { useCallback, useRef, useState } from 'react';

import { getPositionOnce, requestPermission } from '@/services/location';
import { listPlaces } from '@/services/api';

// How long a cached position stays valid. Five minutes is long
// enough that a recent fix is reused, short enough that a student
// who has walked somewhere else is asked again.
const CACHE_TTL_MS = 5 * 60 * 1000;

// Module-level cache. Shared across screens — if Walking Mode just
// snapped a position, the Place detail screen can reuse it.
let _cachedPosition = null;
let _cachedAt = 0;

export function updateCachedPosition(position) {
  if (!position) return;
  _cachedPosition = position;
  _cachedAt = Date.now();
}

function _getCachedPosition() {
  if (!_cachedPosition) return null;
  if (Date.now() - _cachedAt > CACHE_TTL_MS) return null;
  return _cachedPosition;
}

// A helper to clear the cache. Useful for testing, or if the student
// wants to start a fresh location check.
export function clearCachedPosition() {
  _cachedPosition = null;
  _cachedAt = 0;
}

export function useStartingPoint() {
  // 'idle' | 'locating' | 'needPick'
  const [state, setState] = useState('idle');
  const [start, setStart] = useState(null);
  const [nearbyPlaces, setNearbyPlaces] = useState([]);

  // Holds the resolver for the pending "waiting for the student to
  // pick" promise. A ref, not a local variable, so it survives
  // re-renders while the picker is open.
  const pendingResolverRef = useRef(null);

  // Reset everything. Call when a screen unmounts, or to start over.
  const reset = useCallback(() => {
    setState('idle');
    setStart(null);
    setNearbyPlaces([]);
    if (pendingResolverRef.current) {
      pendingResolverRef.current(null);
      pendingResolverRef.current = null;
    }
  }, []);

  // The student picked a place from the sheet. Resolve the pending
  // promise with the chosen place.
  const choosePlace = useCallback((place) => {
    const chosen = { placeId: place.id, placeName: place.name };
    setStart(chosen);
    setState('idle');
    setNearbyPlaces([]);
    if (pendingResolverRef.current) {
      pendingResolverRef.current(chosen);
      pendingResolverRef.current = null;
    }
  }, []);

  // The student dismissed the picker.
  const cancelPick = useCallback(() => {
    setState('idle');
    setNearbyPlaces([]);
    if (pendingResolverRef.current) {
      pendingResolverRef.current(null);
      pendingResolverRef.current = null;
    }
  }, []);

  // The main entry point. Returns a Promise that resolves to:
  //   { lat, lon }             — GPS position available
  //   { placeId, placeName }   — the student chose a place
  //   null                     — cancelled or failed
  //
  // While the promise is pending, `state` reflects what's happening,
  // so the calling screen can show a spinner or the picker.
  const resolveStart = useCallback(async ({ destinationPlaceId } = {}) => {
    // 1. Cached position.
    const cached = _getCachedPosition();
    if (cached) {
      const result = { lat: cached.lat, lon: cached.lon };
      setStart(result);
      return result;
    }

    // 2. Ask for permission and try a fresh fix.
    setState('locating');
    try {
      const granted = await requestPermission();
      if (granted) {
        const fresh = await getPositionOnce({ timeoutMs: 8000 });
        if (fresh) {
          updateCachedPosition(fresh);
          const result = { lat: fresh.lat, lon: fresh.lon };
          setStart(result);
          setState('idle');
          return result;
        }
      }
    } catch {
      // Fall through to the picker.
    }

    // 3. No GPS. Ask the student to pick a starting place.
    setState('needPick');
    try {
      const places = await listPlaces({ limit: 20 });
      // Exclude the destination — the student isn't starting there.
      const filtered = places.filter((p) => p.id !== destinationPlaceId);
      setNearbyPlaces(filtered);
    } catch {
      setNearbyPlaces([]);
    }

    // Return a promise that resolves when the student picks or
    // cancels. Stored in a ref so choosePlace and cancelPick can
    // reach it.
    return new Promise((resolve) => {
      pendingResolverRef.current = resolve;
    });
  }, []);

  return {
    state,
    start,
    nearbyPlaces,
    resolveStart,
    choosePlace,
    cancelPick,
    reset,
  };
}