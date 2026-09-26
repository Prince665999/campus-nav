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

  // Track the last time a good fix was accepted. Used by the stale
  // fallback and by the "searching for GPS" indicator.
  const lastGoodFixAtRef = useRef(Date.now());

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

        // Off-route detection runs on EVERY fix — even ones too rough
        // to move the dot. A noisy fix is still evidence you've
        // drifted off the mapped path. The only gate is the looser
        // OFF_ROUTE_MAX_ACCURACY_M, which rejects cell-tower garbage.
        const geom = geometryRef.current;
        let snapped = null;
        if (geom) {
          snapped = snapToRoute({ lat: loc.lat, lon: loc.lon }, geom);
          if (snapped) {
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
          // Not a good enough fix to move the dot, but we've already
          // updated off-route detection above. Now check whether we
          // should tell the student the GPS is degraded.
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
    // True when no good GPS fix has arrived for DISPLAY_STALE_INDICATOR_S.
    // The dot may still be moving on a stale fallback fix; this just
    // means the fix is older than we'd like.
    gpsStale,
  };
}