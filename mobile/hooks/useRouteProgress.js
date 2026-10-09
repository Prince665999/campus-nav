// useRouteProgress — the walking screen's source of truth for
// "where am I on the route?".
//
// For outdoor portions of a route, this defers entirely to
// useWalkingProgress: GPS, snapping, distanceFromStartM, step
// index — all from the outdoor pipeline, unchanged.
//
// For indoor portions, GPS is ignored. The step index advances
// only when the student taps "Next step" on the instruction card.
// This is deliberate: indoor GPS is unreliable, and a manual
// advance puts the student in control of pacing.
//
// The transition from outdoor to indoor happens when the current
// step's `mode` changes from "outdoor" to "indoor". At that moment,
// this hook captures the outdoor step index as the indoor step
// start, and switches to local advancement.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useWalkingProgress } from '@/hooks/useWalkingProgress';
import { useSettings } from '@/context/SettingsContext';

export function useRouteProgress(route) {
  const { settings } = useSettings();

  // Always run the outdoor hook. It'll be ignored during indoor
  // steps, but it's harmless — the location subscription stays
  // alive but its output is discarded.
  const outdoor = useWalkingProgress(route);

  // Local step index, used only when the current step is indoor.
  const [manualStepIndex, setManualStepIndex] = useState(null);

  // Track the previous current step's mode so we can detect the
  // outdoor→indoor transition and initialize the manual index.
  const lastModeRef = useRef(null);

  const steps = route?.steps || [];

  // Determine whether indoor is enabled for this walk.
  const indoorsEnabled = settings.indoorsEnabled !== false;

  // Determine the outdoor-computed step index (or 0 if unavailable).
  const outdoorStepIndex =
    outdoor.currentStepIndex >= 0 ? outdoor.currentStepIndex : 0;

  // Compute the effective step index and current mode.
  const currentStep = useMemo(() => {
    if (!steps.length) {
      return { index: 0, mode: 'outdoor', step: null };
    }

    // If indoor is disabled entirely, behave as before.
    if (!indoorsEnabled) {
      const idx = outdoorStepIndex;
      const step = steps[idx] || null;
      return {
        index: idx,
        mode: step?.mode || 'outdoor',
        step,
      };
    }

    // If we're in manual mode (student already reached an indoor
    // step), use the manual index.
    if (manualStepIndex !== null) {
      const idx = Math.min(manualStepIndex, steps.length - 1);
      const step = steps[idx] || null;
      return {
        index: idx,
        mode: step?.mode || 'outdoor',
        step,
      };
    }

    // Otherwise use the outdoor-computed index.
    const idx = outdoorStepIndex;
    const step = steps[idx] || null;
    return {
      index: idx,
      mode: step?.mode || 'outdoor',
      step,
    };
  }, [steps, indoorsEnabled, manualStepIndex, outdoorStepIndex]);

  // Detect the outdoor → indoor transition and start manual mode.
  useEffect(() => {
    const mode = currentStep.mode;

    // Transition outdoor → indoor: initialize the manual index at
    // the first indoor step.
    if (
      lastModeRef.current === 'outdoor' &&
      mode === 'indoor' &&
      manualStepIndex === null
    ) {
      setManualStepIndex(currentStep.index);
    }

    lastModeRef.current = mode;
  }, [currentStep.mode, currentStep.index, manualStepIndex]);

  // Reset manual mode when the route changes.
  useEffect(() => {
    setManualStepIndex(null);
    lastModeRef.current = null;
  }, [route]);

  const advanceStep = useCallback(() => {
    setManualStepIndex((prev) => {
      const from = prev === null ? currentStep.index : prev;
      if (from >= steps.length - 1) return from;
      return from + 1;
    });
  }, [currentStep.index, steps.length]);

  // Distance remaining, in metres. During indoor steps, the outdoor
  // value is stale (position is frozen), so we compute a simple
  // approximation from remaining steps. Progress bar only.
  const distanceRemainingM = currentStep.mode === 'indoor'
    ? 0
    : outdoor.distanceRemainingM;

  // Distance to next step. Only meaningful when outdoor.
  const distanceToNextStepM = currentStep.mode === 'indoor'
    ? 0
    : outdoor.distanceToNextStepM;

  // Progress fraction. Outdoor uses the snapped value; indoor uses
  // step index over total steps.
  const progress = currentStep.mode === 'indoor'
    ? (steps.length > 1 ? currentStep.index / (steps.length - 1) : 1)
    : outdoor.progress;

  return {
    permissionGranted: outdoor.permissionGranted,

    // Position (snapped) — null when indoor, so the map doesn't render
    // a stale dot. We keep rawPosition so compass/heading still work
    // for the outdoor case, but the walking screen won't show the dot
    // when mode is indoor.
    position: currentStep.mode === 'indoor' ? null : outdoor.position,
    rawPosition: outdoor.rawPosition,

    currentStepIndex: currentStep.index,
    currentStep: currentStep.step,
    mode: currentStep.mode,

    distanceRemainingM,
    distanceToNextStepM,
    progress,

    offRoute: currentStep.mode === 'indoor' ? false : outdoor.offRoute,
    gpsStale: currentStep.mode === 'indoor' ? false : outdoor.gpsStale,

    resetOffRoute: outdoor.resetOffRoute,

    // Only exposed in indoor mode; the walking screen shows the
    // "Next step" button only when mode === 'indoor'.
    advanceStep,
    isLastStep: currentStep.index >= steps.length - 1,
  };
}