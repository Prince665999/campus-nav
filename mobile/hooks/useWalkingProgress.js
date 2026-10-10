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
import {
  DISPLAY_MAX_ACCURACY_M,
  DISPLAY_STALE_FIX_MS,
  DISPLAY_STALE_INDICATOR_S,
  OFF_ROUTE_MAX_ACCURACY_M,
} from '@/constants/config';

export function useWalkingProgress(route) {
  const [permissionGranted, setPermissionGranted] = useState(null);
  const [rawPosition, setRawPosition] = useState(null);
  const [snappedPosition, setSnappedPosition] = useState(null);
  const [distanceFromStart, setDistanceFromStart] = useState(0);
  const [offRoute, setOffRoute] = useState(false);
  const [gpsStale, setGpsStale] = useState(false);

  const detectorRef = useRef(createOffRouteDetector());
  const lastSegmentIndexRef = useRef(null);
  const lastGoodFixAtRef = useRef(Date.now());
  const geometryRef = useRef(null);

  useEffect(() => {
    geometryRef.current =
      route && route.geometry && route.geometry.length > 1
        ? route.geometry
        : null;
  }, [route]);

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

  useEffect(() => {
    if (!permissionGranted) return;
    if (!hasGeometry) return;

    detectorRef.current.reset();
    lastSegmentIndexRef.current = null;
    lastGoodFixAtRef.current = Date.now();
    setGpsStale(false);

    let cancelled = false;
    let stopFn = null;

    watchLocation(
      (loc) => {
        if (cancelled) return;

        const now = Date.now();
        const isGoodFix =
          loc.accuracyM != null && loc.accuracyM <= DISPLAY_MAX_ACCURACY_M;
        const isStale = now - lastGoodFixAtRef.current > DISPLAY_STALE_FIX_MS;
        const shouldDisplay = isGoodFix || isStale;

        const geom = geometryRef.current;
        let snapped = null;
        if (geom) {
          snapped = snapToRoute(
            { lat: loc.lat, lon: loc.lon },
            geom,
            { nearIndex: lastSegmentIndexRef.current }
          );
          if (snapped) {
            lastSegmentIndexRef.current = snapped.segmentIndex;
            const trustedForOffRoute =
              loc.accuracyM != null &&
              loc.accuracyM <= OFF_ROUTE_MAX_ACCURACY_M;
            if (trustedForOffRoute) {
              const isOffRoute = detectorRef.current.record(snapped.offRouteM);
              setOffRoute((prev) => (prev === isOffRoute ? prev : isOffRoute));
            }
          }
        }

        if (!shouldDisplay) {
          const secondsSinceGoodFix =
            (now - lastGoodFixAtRef.current) / 1000;
          if (secondsSinceGoodFix >= DISPLAY_STALE_INDICATOR_S) {
            setGpsStale((prev) => (prev ? prev : true));
          }
          return;
        }

        lastGoodFixAtRef.current = now;
        setGpsStale((prev) => (prev ? false : prev));

        setRawPosition({
          lat: loc.lat,
          lon: loc.lon,
          accuracyM: loc.accuracyM,
        });

        if (snapped) {
          setSnappedPosition({ lat: snapped.lat, lon: snapped.lon });
          setDistanceFromStart(snapped.distanceFromStartM);
        }
      },
      () => {
        // Silent.
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

  useEffect(() => {
    detectorRef.current.reset();
    lastSegmentIndexRef.current = null;
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
    lastSegmentIndexRef.current = null;
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
    gpsStale,
  };
}