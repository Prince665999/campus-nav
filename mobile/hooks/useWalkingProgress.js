// A React hook that combines location tracking with progress
// tracking.
//
// The dot the student sees is a HYBRID of two points:
//
//   - The snapped point on the route line, when the raw GPS fix is
//     close enough to the line that snapping is plausible. This is
//     the tidy case: the dot sits on the line like a normal walking
//     map.
//
//   - The raw GPS fix, when the snap would land further from the
//     fix than the GPS accuracy can justify. At a corner, on a
//     shortcut, or wherever the snap guesses wrong, the dot
//     follows the student honestly.
//
// "Close enough" is thresholded by the GPS accuracy itself:
//
//     threshold = clamp(accuracyM, 5, 12)   // metres
//
// If accuracy is ±8 m and the snap is 6 m away, we use the snap —
// a 6 m disagreement is within the noise, and the tidy on-line dot
// wins. If accuracy is ±5 m and the snap is 20 m away, the snap is
// genuinely wrong — the raw fix wins.
//
// Why this matters: in the old bug, the snapped point could stay
// pinned at a corner while the student walked away, because the
// snap was stuck on the wrong segment. Under the hybrid, the
// disagreement grows as the student walks, and once it exceeds the
// threshold, the dot flips to the raw fix. The pinned dot lasts at
// most a few metres, which nobody notices.
//
// The displayed position is smoothed between fixes: each new target
// moves the dot 55% of the way from where it was. This hides the
// flip between snapped and raw, and it hides ordinary GPS jitter.
// Smoothing resets on a route change, on a fix gap longer than 5 s,
// or on a jump over 60 m — so a resumed walk doesn't glide across
// the map.
//
// The snap is still used for:
//   - step index
//   - distance remaining
//   - off-route detection (which drives the "you seem off route" banner)
// It is not used for the dot's drawn position.

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  requestPermission,
  watch as watchLocation,
  stopWatching,
} from '@/services/location';
import { snapToRoute, haversineM } from '@/utils/geo';
import {
  createOffRouteDetector,
  currentStepIndex,
  distanceRemaining,
  distanceToNextStep,
  progressFraction,
} from '@/utils/progress';
import {
  DISPLAY_MAX_ACCURACY_M,
  DISPLAY_MAX_ACCURACY_HARD_M,
  DISPLAY_STALE_FIX_MS,
  DISPLAY_STALE_INDICATOR_S,
  OFF_ROUTE_MAX_ACCURACY_M,
  LOCAL_RESNAP_MAX_M,
} from '@/constants/config';

const SMOOTHING_FACTOR = 0.55;
const SMOOTHING_MAX_GAP_MS = 5000;
const SMOOTHING_MAX_JUMP_M = 60;

// The hybrid threshold: how far the snap is allowed to be from the
// raw fix before we trust the raw fix over the snap. Scaled by
// accuracy, capped at both ends.
const HYBRID_THRESHOLD_MIN_M = 5;
const HYBRID_THRESHOLD_MAX_M = 12;

function hybridThreshold(accuracyM) {
  if (accuracyM == null || !Number.isFinite(accuracyM)) {
    // No accuracy reported. Fall back to the midpoint of the range;
    // this is uncommon and any sensible default is fine.
    return (HYBRID_THRESHOLD_MIN_M + HYBRID_THRESHOLD_MAX_M) / 2;
  }
  return Math.min(
    HYBRID_THRESHOLD_MAX_M,
    Math.max(HYBRID_THRESHOLD_MIN_M, accuracyM)
  );
}

export function useWalkingProgress(route) {
  const [permissionGranted, setPermissionGranted] = useState(null);
  const [rawPosition, setRawPosition] = useState(null);
  const [displayPosition, setDisplayPosition] = useState(null);
  const [snappedPosition, setSnappedPosition] = useState(null);
  const [accuracyM, setAccuracyM] = useState(null);
  const [distanceFromStart, setDistanceFromStart] = useState(0);
  const [offRoute, setOffRoute] = useState(false);
  const [gpsStale, setGpsStale] = useState(false);

  const detectorRef = useRef(createOffRouteDetector());
  const lastSegmentIndexRef = useRef(null);
  const lastSnapDistanceRef = useRef(0);
  const lastGoodFixAtRef = useRef(Date.now());
  const lastFixWallClockRef = useRef(0);
  const geometryRef = useRef(null);
  const smoothRef = useRef(null);

  useEffect(() => {
    geometryRef.current =
      route && route.geometry && route.geometry.length > 1
        ? route.geometry
        : null;
  }, [route]);

  // Reset smoothing and snap continuity when the route changes.
  useEffect(() => {
    smoothRef.current = null;
    lastSegmentIndexRef.current = null;
    lastSnapDistanceRef.current = 0;
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
    lastSnapDistanceRef.current = 0;
    lastGoodFixAtRef.current = Date.now();
    lastFixWallClockRef.current = 0;
    setGpsStale(false);

    let cancelled = false;
    let stopFn = null;

    watchLocation(
      (loc) => {
        if (cancelled) return;

        const now = Date.now();

        // Hard cap: discard fixes worse than the hard threshold
        // entirely. These are almost always network-based estimates
        // or cell-tower triangulation, not real GPS.
        if (
          loc.accuracyM != null &&
          loc.accuracyM > DISPLAY_MAX_ACCURACY_HARD_M
        ) {
          return;
        }

        const isGoodFix =
          loc.accuracyM != null && loc.accuracyM <= DISPLAY_MAX_ACCURACY_M;
        const isStale = now - lastGoodFixAtRef.current > DISPLAY_STALE_FIX_MS;
        const shouldDisplay = isGoodFix || isStale;

        // --- snap for progress and for the hybrid target ---
        const geom = geometryRef.current;
        let snapped = null;
        if (geom) {
          snapped = snapToRoute(
            { lat: loc.lat, lon: loc.lon },
            geom,
            { nearIndex: lastSegmentIndexRef.current }
          );
          if (snapped && !snapped.rejected) {
            lastSegmentIndexRef.current = snapped.segmentIndex;
            lastSnapDistanceRef.current = snapped.distanceFromStartM;
            const trustedForOffRoute =
              loc.accuracyM != null &&
              loc.accuracyM <= OFF_ROUTE_MAX_ACCURACY_M;
            if (trustedForOffRoute) {
              const isOffRoute = detectorRef.current.record(snapped.offRouteM);
              setOffRoute((prev) => (prev === isOffRoute ? prev : isOffRoute));
            }
          }
        }

        // --- display gate ---
        if (!shouldDisplay) {
          const secondsSinceGoodFix =
            (now - lastGoodFixAtRef.current) / 1000;
          if (secondsSinceGoodFix >= DISPLAY_STALE_INDICATOR_S) {
            setGpsStale((prev) => (prev ? prev : true));
          }
          return;
        }

        // Only a genuinely good fix resets the stale clock. The
        // earlier version reset it in the stale branch, so while
        // accuracy stayed above the good threshold the dot updated
        // once every DISPLAY_STALE_FIX_MS.
        if (isGoodFix) {
          lastGoodFixAtRef.current = now;
          setGpsStale((prev) => (prev ? false : prev));
        }

        const raw = { lat: loc.lat, lon: loc.lon };
        setRawPosition({
          lat: raw.lat,
          lon: raw.lon,
          accuracyM: loc.accuracyM,
        });
        setAccuracyM(loc.accuracyM ?? null);

        // --- hybrid target: snapped or raw? ---
        //
        // Use the snapped point when it's close enough to the fix
        // that snapping is plausible given the GPS accuracy. Otherwise
        // use the raw fix, so the dot follows the student through a
        // corner or a shortcut without a delay.
        let target = raw;
        if (snapped && !snapped.rejected) {
          const threshold = hybridThreshold(loc.accuracyM);
          if (snapped.offRouteM <= threshold) {
            target = { lat: snapped.lat, lon: snapped.lon };
          }
        }

        // --- smooth the display toward the target ---
        const gapMs = now - lastFixWallClockRef.current;
        const prev = smoothRef.current;
        let next;
        if (
          prev == null ||
          gapMs > SMOOTHING_MAX_GAP_MS ||
          haversineM(prev.lat, prev.lon, target.lat, target.lon) >
            SMOOTHING_MAX_JUMP_M
        ) {
          // First fix, resumed after a gap, or a genuinely big jump.
          // Take the target unchanged so the dot doesn't glide.
          next = target;
        } else {
          next = {
            lat: prev.lat + SMOOTHING_FACTOR * (target.lat - prev.lat),
            lon: prev.lon + SMOOTHING_FACTOR * (target.lon - prev.lon),
          };
        }
        smoothRef.current = next;
        lastFixWallClockRef.current = now;
        setDisplayPosition(next);

        // --- progress values from the snap ---
        if (snapped && !snapped.rejected) {
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
    lastSnapDistanceRef.current = 0;
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
    lastSnapDistanceRef.current = 0;
    setOffRoute(false);
  }, []);

  return {
    permissionGranted,
    // The dot's drawn position: hybrid of snapped and raw, smoothed.
    position: displayPosition,
    // The snapped point on the route, for anyone who needs an
    // on-route point. Currently only exposed for potential debugging.
    snappedPosition,
    rawPosition,
    // Reported GPS accuracy in metres, from the most recent fix. Used
    // to draw the accuracy circle on the map.
    accuracyM,
    currentStepIndex: stepIndex,
    currentStep: step,
    distanceRemainingM: remaining,
    distanceToNextStepM: nextStepDistance,
    offRoute,
    progress,
    resetOffRoute,
    gpsStale,
    localResnapMaxM: LOCAL_RESNAP_MAX_M,
  };
}