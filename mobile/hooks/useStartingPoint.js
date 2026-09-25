// Determines where a route should start from.
//
// There is no cache. Every "Take me there" gets a fresh GPS fix.
// If the fix fails, the student is told and offered a retry, or the
// option to pick a starting place from a list.

import { useCallback, useRef, useState } from 'react';

import { getPositionOnce, requestPermission } from '@/services/location';
import { listPlaces } from '@/services/api';

const GPS_TIMEOUT_MS = 15000;

export function useStartingPoint() {
  const [state, setState] = useState('idle');
  const [start, setStart] = useState(null);
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [lastError, setLastError] = useState(null);

  const pendingResolverRef = useRef(null);

  const reset = useCallback(() => {
    setState('idle');
    setStart(null);
    setNearbyPlaces([]);
    setLastError(null);
    if (pendingResolverRef.current) {
      pendingResolverRef.current(null);
      pendingResolverRef.current = null;
    }
  }, []);

  const choosePlace = useCallback((place) => {
    console.log('useStartingPoint: choosePlace', place.id, place.name);
    const chosen = { placeId: place.id, placeName: place.name };
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

  const resolveStart = useCallback(async ({ destinationPlaceId } = {}) => {
    console.log('resolveStart: called, destinationPlaceId =', destinationPlaceId);
    setLastError(null);

    // 1. Permission.
    setState('locating');
    let granted = false;
    try {
      granted = await requestPermission();
      console.log('resolveStart: permission granted =', granted);
    } catch (err) {
      console.log('resolveStart: permission error =', err.message);
      setLastError('permission_error');
      setState('idle');
      return null;
    }

    if (!granted) {
      console.log('resolveStart: permission denied, returning null');
      setLastError('permission_denied');
      setState('idle');
      return null;
    }

    // 2. Fresh GPS fix.
    console.log('resolveStart: requesting position with timeout', GPS_TIMEOUT_MS);
    try {
      const fresh = await getPositionOnce({ timeoutMs: GPS_TIMEOUT_MS });
      console.log('resolveStart: fresh fix =', fresh);
      if (fresh) {
        const result = { lat: fresh.lat, lon: fresh.lon };
        setStart(result);
        setState('idle');
        return result;
      }
    } catch (err) {
      console.log('resolveStart: getPositionOnce error =', err.message);
    }

    // 3. No fix. Offer the picker.
    console.log('resolveStart: no fix, opening picker');
    setLastError('no_fix');
    setState('needPick');
    try {
      const places = await listPlaces({ limit: 20 });
      const filtered = places.filter((p) => p.id !== destinationPlaceId);
      console.log('resolveStart: picker loaded', filtered.length, 'places');
      setNearbyPlaces(filtered);
    } catch {
      setNearbyPlaces([]);
    }

    return new Promise((resolve) => {
      console.log('resolveStart: awaiting picker selection');
      pendingResolverRef.current = resolve;
    });
  }, []);

  return {
    state,
    start,
    nearbyPlaces,
    lastError,
    resolveStart,
    choosePlace,
    cancelPick,
    reset,
  };
}