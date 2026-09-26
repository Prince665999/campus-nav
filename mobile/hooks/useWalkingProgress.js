// A React hook that combines location tracking with progress
// tracking.

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  requestPermission,
  watch as watchLocation,
  stopWatching,
} from '@/services/location';
import { snapToRoute } from '@/utils/geo';
import {
  createOffRouteDetector,
  currentStepIndex,
  distanceRemaining,
  distanceToNextStep,
  progressFraction,
} from '@/utils/progress';

// GPS fixes above this accuracy are ignored for display purposes —
// they're usually network-based estimates, not real GPS, and they
// would jump the dot to a wrong spot. 40 m is generous enough to
// accept every real GPS fix while rejecting the 80–100+ m network
// fallbacks.
const MAX_DISPLAY_ACCURACY_M = 40;

// If no good fix has arrived in this many milliseconds, accept the
// best available fix even if it's above the accuracy threshold.
// Without this, walking under cover would freeze the dot entirely.
const STALE_FIX_MS = 8000;

export function useWalkingProgress(route) {
  const [permissionGranted, setPermissionGranted] = useState(null);
  const [rawPosition, setRawPosition] = useState(null);
  const [snappedPosition, setSnappedPosition] = useState(null);
  const [distanceFromStart, setDistanceFromStart] = useState(0);
  const [offRoute, setOffRoute] = useState(false);

  const detectorRef = useRef(createOffRouteDetector());

  // Track the last time a good fix was accepted. Used by the stale
  // fallback above.
  const lastGoodFixAtRef = useRef(0);

  // The current route geometry, kept in a ref so the location
  // callback always reads the latest without the subscription effect
  // depending on the route object.
  const geometryRef = useRef(null);

  useEffect(() => {
    geometryRef.current =
      route && route.geometry && route.geometry.length > 1
        ? route.geometry
        : null;
  }, [route]);

  // Ask for permission once, when the hook first mounts.
  useEffect(() => {
    let cancelled = false;
    requestPermission().then((granted) => {
      if (!cancelled) setPermissionGranted(granted);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasGeometry = !!(
    route &&
    route.geometry &&
    route.geometry.length > 1
  );

  // Subscribe to GPS updates. Depends only on whether a geometry
  // exists, not on the route object itself.
  useEffect(() => {
    if (!permissionGranted) return;
    if (!hasGeometry) return;

    detectorRef.current.reset();
    lastGoodFixAtRef.current = Date.now();

    let cancelled = false;
    let stopFn = null;

    watchLocation(
      (loc) => {
        if (cancelled) return;

        // Quality gate: skip fixes whose accuracy is worse than the
        // threshold, unless nothing good has arrived for a while.
        const now = Date.now();
        const isGoodFix =
          loc.accuracyM != null && loc.accuracyM <= MAX_DISPLAY_ACCURACY_M;
        const isStale = now - lastGoodFixAtRef.current > STALE_FIX_MS;

        if (!isGoodFix && !isStale) {
          return;
        }
        lastGoodFixAtRef.current = now;

        setRawPosition({
          lat: loc.lat,
          lon: loc.lon,
          accuracyM: loc.accuracyM,
        });

        const geom = geometryRef.current;
        if (!geom) return;

        const snapped = snapToRoute({ lat: loc.lat, lon: loc.lon }, geom);
        if (!snapped) return;

        setSnappedPosition({ lat: snapped.lat, lon: snapped.lon });
        setDistanceFromStart(snapped.distanceFromStartM);

        const isOffRoute = detectorRef.current.record(snapped.offRouteM);
        setOffRoute((prev) => (prev === isOffRoute ? prev : isOffRoute));
      },
      () => {
        // Location error. Subscription stays alive.
      }
    ).then((fn) => {
      if (cancelled) {
        if (fn) fn();
      } else {
        stopFn = fn;
      }
    });

    return () => {
      cancelled = true;
      if (stopFn) stopFn();
      else stopWatching();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionGranted, hasGeometry]);

  // Reset the detector when the route object changes.
  useEffect(() => {
    detectorRef.current.reset();
    setOffRoute(false);
  }, [route]);

  const totalDistance = route?.distance_m || 0;
  const steps = route?.steps || [];

  const stepIndex = currentStepIndex(steps, distanceFromStart);
  const step = stepIndex >= 0 ? steps[stepIndex] : null;

  const remaining = distanceRemaining(totalDistance, distanceFromStart);
  const nextStepDistance = distanceToNextStep(
    steps,
    stepIndex,
    distanceFromStart
  );
  const progress = progressFraction(totalDistance, distanceFromStart);

  const resetOffRoute = useCallback(() => {
    detectorRef.current.reset();
    setOffRoute(false);
  }, []);

  return {
    permissionGranted,
    position: snappedPosition,
    rawPosition,
    currentStepIndex: stepIndex,
    currentStep: step,
    distanceRemainingM: remaining,
    distanceToNextStepM: nextStepDistance,
    offRoute,
    progress,
    resetOffRoute,
  };
}