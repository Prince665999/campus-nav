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

export function useWalkingProgress(route) {
  const [permissionGranted, setPermissionGranted] = useState(null);
  const [rawPosition, setRawPosition] = useState(null);
  const [snappedPosition, setSnappedPosition] = useState(null);
  const [distanceFromStart, setDistanceFromStart] = useState(0);
  const [offRoute, setOffRoute] = useState(false);

  const detectorRef = useRef(createOffRouteDetector());

  // The current route geometry. Kept in a ref so the location
  // callback reads the latest without the subscription effect
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

  // Subscribe to GPS updates. This effect depends only on whether
  // a geometry exists, not on the route object itself — so a
  // recompute doesn't tear down the subscription.
  useEffect(() => {
    if (!permissionGranted) return;
    if (!hasGeometry) return;

    detectorRef.current.reset();

    let cancelled = false;
    let stopFn = null;

    watchLocation(
      (loc) => {
        if (cancelled) return;

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
        // Ignore errors. The subscription stays alive and may
        // deliver updates again later.
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

  // When the route object changes, reset the detector.
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