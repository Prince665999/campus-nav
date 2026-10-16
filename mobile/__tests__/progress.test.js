// Tests for utils/progress.js.

import {
  currentStepIndex,
  distanceRemaining,
  distanceToNextStep,
  createOffRouteDetector,
  progressFraction,
  OFF_ROUTE_THRESHOLD_M,
  OFF_ROUTE_CONSECUTIVE_FIXES,
  OFF_ROUTE_WARMUP_FIXES,
} from '@/utils/progress';

const steps = [
  { at_m: 0, instruction: 'Head north' },
  { at_m: 30, instruction: 'Turn right' },
  { at_m: 120, instruction: 'Continue past the library' },
  { at_m: 200, instruction: 'Arrive at the canteen' },
];

describe('currentStepIndex', () => {
  test('at the start, index is 0', () => {
    expect(currentStepIndex(steps, 0)).toBe(0);
  });

  test('at the middle of step 1, index is 1', () => {
    expect(currentStepIndex(steps, 50)).toBe(1);
  });

  test('exactly at a step boundary, index is that step', () => {
    expect(currentStepIndex(steps, 30)).toBe(1);
    expect(currentStepIndex(steps, 120)).toBe(2);
  });

  test('past the last step, index is the last step', () => {
    expect(currentStepIndex(steps, 500)).toBe(3);
  });

  test('empty steps returns -1', () => {
    expect(currentStepIndex([], 0)).toBe(-1);
  });
});

describe('distanceRemaining', () => {
  test('subtracts distance walked', () => {
    expect(distanceRemaining(200, 50)).toBe(150);
  });

  test('never goes negative', () => {
    expect(distanceRemaining(200, 300)).toBe(0);
  });
});

describe('distanceToNextStep', () => {
  test('from step 0 to step 1', () => {
    expect(distanceToNextStep(steps, 0, 10)).toBe(20);
  });

  test('from step 2 to step 3', () => {
    expect(distanceToNextStep(steps, 2, 150)).toBe(50);
  });

  test('on the last step, gives distance to arrival', () => {
    expect(distanceToNextStep(steps, 3, 180)).toBe(20);
  });
});

// Helpers ----------------------------------------------------------------
//
// The detector ignores the first OFF_ROUTE_WARMUP_FIXES fixes entirely
// (to avoid firing during the noisy startup period of a walk), and
// then requires OFF_ROUTE_CONSECUTIVE_FIXES consecutive off-route
// fixes before it reports true. The tests below respect that.

function feedOffRoute(detector, n) {
  const above = OFF_ROUTE_THRESHOLD_M + 5;
  let result = false;
  for (let i = 0; i < n; i++) {
    result = detector.record(above);
  }
  return result;
}

function feedOnRoute(detector, n) {
  let result = false;
  for (let i = 0; i < n; i++) {
    result = detector.record(0);
  }
  return result;
}

describe('createOffRouteDetector', () => {
  test('not off-route when within threshold', () => {
    const d = createOffRouteDetector();
    expect(d.record(5)).toBe(false);
    expect(d.record(10)).toBe(false);
    expect(d.record(5)).toBe(false);
  });

  test('does not fire during the warmup window', () => {
    const d = createOffRouteDetector();
    // Even a long run of off-route fixes must not fire while we are
    // still inside the warmup period.
    expect(feedOffRoute(d, OFF_ROUTE_WARMUP_FIXES)).toBe(false);
  });

  test('fires after the warmup plus the consecutive-fix requirement', () => {
    const d = createOffRouteDetector();
    // Consume the warmup (all ignored).
    feedOffRoute(d, OFF_ROUTE_WARMUP_FIXES);
    // Now the consecutive count starts. The last fix should fire.
    expect(feedOffRoute(d, OFF_ROUTE_CONSECUTIVE_FIXES)).toBe(true);
  });

  test('a single on-route fix resets the counter', () => {
    const d = createOffRouteDetector();
    feedOffRoute(d, OFF_ROUTE_WARMUP_FIXES);
    feedOffRoute(d, OFF_ROUTE_CONSECUTIVE_FIXES - 1);
    // One on-route fix.
    d.record(0);
    // We now need the full count again.
    expect(feedOffRoute(d, OFF_ROUTE_CONSECUTIVE_FIXES - 1)).toBe(false);
    expect(d.record(OFF_ROUTE_THRESHOLD_M + 5)).toBe(true);
  });

  test('reset clears the counter', () => {
    const d = createOffRouteDetector();
    feedOffRoute(d, OFF_ROUTE_WARMUP_FIXES);
    feedOffRoute(d, OFF_ROUTE_CONSECUTIVE_FIXES - 1);
    d.reset();
    // After reset, we start over, including the warmup.
    expect(d.record(OFF_ROUTE_THRESHOLD_M + 5)).toBe(false);
  });

  test('consecutive-fix requirement matches the exported constant', () => {
    const d = createOffRouteDetector();
    feedOffRoute(d, OFF_ROUTE_WARMUP_FIXES);
    for (let i = 0; i < OFF_ROUTE_CONSECUTIVE_FIXES - 1; i++) {
      expect(d.record(OFF_ROUTE_THRESHOLD_M + 5)).toBe(false);
    }
    expect(d.record(OFF_ROUTE_THRESHOLD_M + 5)).toBe(true);
  });
});

describe('progressFraction', () => {
  test('zero distance walked gives 0', () => {
    expect(progressFraction(200, 0)).toBe(0);
  });

  test('halfway gives 0.5', () => {
    expect(progressFraction(200, 100)).toBe(0.5);
  });

  test('past the end gives 1', () => {
    expect(progressFraction(200, 300)).toBe(1);
  });

  test('zero total gives 0', () => {
    expect(progressFraction(0, 50)).toBe(0);
  });
});