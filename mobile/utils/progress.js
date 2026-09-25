// Walks the instruction timeline forward as the student moves.

export const OFF_ROUTE_THRESHOLD_M = 35;
export const OFF_ROUTE_CONSECUTIVE_FIXES = 5;
export const OFF_ROUTE_WARMUP_FIXES = 8;

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

export function createOffRouteDetector() {
  let consecutiveOffRoute = 0;
  let fixesSeen = 0;

  return {
    record(offRouteM) {
      fixesSeen += 1;

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