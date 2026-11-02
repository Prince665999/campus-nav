// Walks the instruction timeline forward as the student moves.
//
// Step anchoring contract (set by the backend, see
// backend/api/services/step_merge.py):
//
//   steps[k].at_m is the distance from the start at which step k's LEG
//   BEGINS. Step k is the instruction for walking from at_m[k] to
//   at_m[k + 1] (the turn that ends it). So step k becomes current when
//   the walker reaches at_m[k], and the distance to the next turn is
//   at_m[k + 1] - distance. The last step runs to the route's total
//   distance.

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

// How far BEFORE a step's at_m we already switch to it. GPS reports
// arrive late and the voice takes a couple of seconds to speak, so
// switching exactly at the corner means the instruction lands after
// the walker has already taken it. Kept small: the text describes the
// leg that starts at the corner.
export const STEP_SWITCH_LOOKAHEAD_M = 3;

// How far back along the route the walker must go before we allow the
// step index to go back to an earlier step. Smaller than this is GPS
// noise and snap flicker at a corner, which must not re-announce a
// step that was already spoken.
export const STEP_BACKTRACK_M = 25;

/**
 * Pick the step index for a position, never flickering backwards.
 *
 * currentStepIndex() is a pure function of distance. Near a corner the
 * snapped distance can wobble by a few metres either side of at_m, which
 * flipped the card (and the spoken instruction) back and forth. This
 * keeps the highest step reached, and only lets the index drop when
 * the walker has genuinely gone back STEP_BACKTRACK_M behind where
 * that step began.
 *
 * It also never lags: if the walker has passed several corners between
 * two fixes (a shortcut, a gap in GPS), the index jumps straight to
 * the step they are on now, not one at a time.
 */
export function resolveStepIndex(steps, distanceFromStartM, previousIndex = 0) {
  if (!steps || steps.length === 0) return -1;

  const raw = currentStepIndex(
    steps,
    distanceFromStartM + STEP_SWITCH_LOOKAHEAD_M
  );

  const prev = Math.min(Math.max(previousIndex ?? 0, 0), steps.length - 1);
  if (raw >= prev) return raw;

  // The walker appears to be behind the step already shown.
  const backtracked = steps[prev].at_m - distanceFromStartM;
  return backtracked > STEP_BACKTRACK_M ? raw : prev;
}

export function distanceRemaining(totalDistanceM, distanceFromStartM) {
  return Math.max(0, totalDistanceM - distanceFromStartM);
}

export function distanceToNextStep(
  steps,
  currentIndex,
  distanceFromStartM,
  totalDistanceM = null
) {
  if (!steps || steps.length === 0) return 0;
  if (currentIndex >= steps.length - 1) {
    // The last step's leg ends at the destination. (Its own at_m is
    // where the leg BEGINS, so measuring to it would always give 0.)
    const end =
      totalDistanceM != null && totalDistanceM > 0
        ? totalDistanceM
        : steps[steps.length - 1].at_m;
    return Math.max(0, end - distanceFromStartM);
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