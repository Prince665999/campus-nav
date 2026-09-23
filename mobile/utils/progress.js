// Walks the instruction timeline forward as the student moves.
//
// The off-route detector has a warm-up phase: the first few GPS
// fixes after a walk starts are ignored. GPS needs a few seconds to
// stabilise, and the student may be standing a metre or two off the
// path while the fix settles. Without the warm-up, the off-route
// banner fires immediately on every walk.

export const OFF_ROUTE_THRESHOLD_M = 20;
export const OFF_ROUTE_CONSECUTIVE_FIXES = 3;

// The first N fixes after the detector is created are ignored
// entirely. Three fixes at one per second is three seconds — long
// enough for GPS to stabilise.
export const OFF_ROUTE_WARMUP_FIXES = 4;

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

export function distanceRemaining(totalDistanceM, distanceFromStartM) {
  return Math.max(0, totalDistanceM - distanceFromStartM);
}

export function distanceToNextStep(steps, currentIndex, distanceFromStartM) {
  if (!steps || steps.length === 0) return 0;
  if (currentIndex >= steps.length - 1) {
    const last = steps[steps.length - 1];
    return Math.max(0, last.at_m - distanceFromStartM);
  }
  const next = steps[currentIndex + 1];
  return Math.max(0, next.at_m - distanceFromStartM);
}

// A small state machine for off-route detection.
//
// The detector has three phases:
//   - warm-up: the first few fixes. Always returns false.
//   - counting: counts consecutive off-route fixes.
//   - fired: has returned true at least once. Doesn't fire again
//     until reset.
export function createOffRouteDetector() {
  let consecutiveOffRoute = 0;
  let fixesSeen = 0;

  return {
    record(offRouteM) {
      fixesSeen += 1;

      // Warm-up. Ignore the first few fixes so GPS can settle.
      if (fixesSeen <= OFF_ROUTE_WARMUP_FIXES) {
        return false;
      }

      if (offRouteM > OFF_ROUTE_THRESHOLD_M) {
        consecutiveOffRoute += 1;
      } else {
        consecutiveOffRoute = 0;
      }
      return consecutiveOffRoute >= OFF_ROUTE_CONSECUTIVE_FIXES;
    },
    reset() {
      consecutiveOffRoute = 0;
      fixesSeen = 0;
    },
    get count() {
      return consecutiveOffRoute;
    },
    get fixesSeen() {
      return fixesSeen;
    },
  };
}

export function progressFraction(totalDistanceM, distanceFromStartM) {
  if (totalDistanceM <= 0) return 0;
  return Math.max(0, Math.min(1, distanceFromStartM / totalDistanceM));
}