// Walks the instruction timeline forward as the student moves.
//
// The route from /api/route has a `steps` array, each with an
// `at_m` value — the number of metres into the walk where that
// instruction occurs. As the student's snapped position advances,
// this module decides which step is "current" and when the student
// has gone off-route for long enough to warrant a warning.

// How far off the route the student has to be before we count a fix
// as "off-route". Set to 20 metres to match the roadmap.
export const OFF_ROUTE_THRESHOLD_M = 20;

// How many consecutive off-route readings before we raise the banner.
// One reading is often just GPS noise.
export const OFF_ROUTE_CONSECUTIVE_FIXES = 3;

// Find the index of the instruction step the student is currently on.
//
// A step becomes "current" once the student passes its at_m value.
// The walk starts on step 0 (the "Head north from X" step) and ends
// on the last step (the "arrive" step).
export function currentStepIndex(steps, distanceFromStartM) {
  if (!steps || steps.length === 0) return -1;
  if (distanceFromStartM <= steps[0].at_m) return 0;

  for (let i = 0; i < steps.length - 1; i++) {
    const thisAt = steps[i].at_m;
    const nextAt = steps[i + 1].at_m;
    if (distanceFromStartM >= thisAt && distanceFromStartM < nextAt) {
      return i;
    }
  }
  return steps.length - 1;
}

// How far the student still has to walk, in metres.
export function distanceRemaining(totalDistanceM, distanceFromStartM) {
  return Math.max(0, totalDistanceM - distanceFromStartM);
}

// How far until the next turn. If the student is on the last step,
// returns the distance to the end of the walk.
export function distanceToNextStep(steps, currentIndex, distanceFromStartM) {
  if (!steps || steps.length === 0) return 0;
  if (currentIndex >= steps.length - 1) {
    // On the last step. The remaining distance is distance to arrival.
    const last = steps[steps.length - 1];
    return Math.max(0, last.at_m - distanceFromStartM);
  }
  const next = steps[currentIndex + 1];
  return Math.max(0, next.at_m - distanceFromStartM);
}

// A small state machine for off-route detection.
//
// Every GPS fix, call `record(offRouteM)`. It returns true when the
// student has been off-route for OFF_ROUTE_CONSECUTIVE_FIXES in a
// row, which is when the app should suggest recalculating.
export function createOffRouteDetector() {
  let consecutiveOffRoute = 0;

  return {
    record(offRouteM) {
      if (offRouteM > OFF_ROUTE_THRESHOLD_M) {
        consecutiveOffRoute += 1;
      } else {
        consecutiveOffRoute = 0;
      }
      return consecutiveOffRoute >= OFF_ROUTE_CONSECUTIVE_FIXES;
    },
    reset() {
      consecutiveOffRoute = 0;
    },
    get count() {
      return consecutiveOffRoute;
    },
  };
}

// How far through the walk the student is, as a 0..1 fraction.
// Used by the progress bar on the instruction card.
export function progressFraction(totalDistanceM, distanceFromStartM) {
  if (totalDistanceM <= 0) return 0;
  return Math.max(0, Math.min(1, distanceFromStartM / totalDistanceM));
}