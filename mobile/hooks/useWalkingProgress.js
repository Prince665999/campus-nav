// A React hook that combines location tracking with progress
// tracking. Given a route, it tracks the student's position, snaps
// it to the route, and exposes the current step, distance remaining,
// distance to next turn, off-route state, and progress fraction.

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

  // Once permission is granted and the route is available, start
  // watching the position.
  useEffect(() => {
    if (!permissionGranted || !route || !route.geometry) return;

    // Reset the detector and its warm-up counter when the route
    // changes. A new route means a new reference frame.
    detectorRef.current.reset();

    let stop = null;
    let cancelled = false;

    watchLocation((loc) => {
      if (cancelled) return;

      setRawPosition({ lat: loc.lat, lon: loc.lon });

      const snapped = snapToRoute(
        { lat: loc.lat, lon: loc.lon },
        route.geometry
      );
      if (!snapped) return;

      setSnappedPosition({ lat: snapped.lat, lon: snapped.lon });
      setDistanceFromStart(snapped.distanceFromStartM);

      const isOffRoute = detectorRef.current.record(snapped.offRouteM);
      setOffRoute((prev) => (prev === isOffRoute ? prev : isOffRoute));
    }).then((stopFn) => {
      stop = stopFn;
    });

    return () => {
      cancelled = true;
      if (stop) stop();
      else stopWatching();
    };
  }, [permissionGranted, route]);

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