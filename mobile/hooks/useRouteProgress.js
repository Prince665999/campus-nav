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

  const distanceToNextStepM = currentStep.mode === 'indoor'
    ? 0
    : outdoor.distanceToNextStepM;

  const progress = currentStep.mode === 'indoor'
    ? (steps.length > 1 ? currentStep.index / (steps.length - 1) : 1)
    : outdoor.progress;

  // -----------------------------------------------------------------
  // Indoor-specific derived values
  // -----------------------------------------------------------------

  // The current indoor level, from the current step. Used by the
  // indoor floor plan to fetch the right floor. Null when outdoor.
  const indoorLevel =
    currentStep.mode === 'indoor' && currentStep.step
      ? currentStep.step.level || null
      : null;

  // The current building name, from the current step. Null when
  // outdoor.
  const indoorBuildingName =
    currentStep.mode === 'indoor' && currentStep.step
      ? currentStep.step.building_name || null
      : null;

  // The indoor portion of the route geometry. Sliced using the
  // geometry_index of the first and last indoor steps.
  //
  // The route's geometry is one long array covering both outdoor and
  // indoor legs. Each indoor step carries geometry_index — its
  // position in that array. Taking the first indoor step's index as
  // the start and the last's as the end gives us the indoor slice.
  const indoorGeometry = useMemo(() => {
    if (!route?.geometry || !steps.length) return [];

    let firstIndoorIdx = null;
    let lastIndoorIdx = null;
    for (const step of steps) {
      if (step.mode !== 'indoor') continue;
      const gi = step.geometry_index;
      if (gi == null) continue;
      if (firstIndoorIdx === null) firstIndoorIdx = gi;
      lastIndoorIdx = gi;
    }
    if (firstIndoorIdx === null) return [];

    return route.geometry.slice(firstIndoorIdx, lastIndoorIdx + 1);
  }, [route?.geometry, steps]);

  // The destination point of the indoor leg. Used by the floor plan
  // to place a marker. The last indoor step's geometry_index points
  // at the destination node.
  const indoorDestination = useMemo(() => {
    if (!route?.geometry || !steps.length) return null;
    let lastIndoorIdx = null;
    for (const step of steps) {
      if (step.mode !== 'indoor') continue;
      if (step.geometry_index == null) continue;
      lastIndoorIdx = step.geometry_index;
    }
    if (lastIndoorIdx === null) return null;
    return route.geometry[lastIndoorIdx] || null;
  }, [route?.geometry, steps]);

  return {
    permissionGranted: outdoor.permissionGranted,

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

    advanceStep,
    isLastStep: currentStep.index >= steps.length - 1,

    // Indoor-specific values, for the floor plan.
    indoorLevel,
    indoorBuildingName,
    indoorGeometry,
    indoorDestination,
  };
}