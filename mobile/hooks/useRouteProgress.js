// useRouteProgress — the walking screen's source of truth.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useWalkingProgress } from '@/hooks/useWalkingProgress';
import { useSettings } from '@/context/SettingsContext';

export function useRouteProgress(route, { startedFromPlace = false } = {}) {
  const { settings } = useSettings();

  const outdoor = useWalkingProgress(route);

  const [manualStepIndex, setManualStepIndex] = useState(null);
  const lastModeRef = useRef(null);

  const steps = route?.steps || [];
  const indoorsEnabled = settings.indoorsEnabled !== false;

  useEffect(() => {
    if (startedFromPlace && manualStepIndex === null) {
      setManualStepIndex(0);
    }
  }, [startedFromPlace, manualStepIndex]);

  const outdoorStepIndex =
    outdoor.currentStepIndex >= 0 ? outdoor.currentStepIndex : 0;

  const currentStep = useMemo(() => {
    if (!steps.length) {
      return { index: 0, mode: 'outdoor', step: null };
    }
    if (!indoorsEnabled) {
      const idx = outdoorStepIndex;
      const step = steps[idx] || null;
      return { index: idx, mode: step?.mode || 'outdoor', step };
    }
    if (manualStepIndex !== null) {
      const idx = Math.min(manualStepIndex, steps.length - 1);
      const step = steps[idx] || null;
      return { index: idx, mode: step?.mode || 'outdoor', step };
    }
    const idx = outdoorStepIndex;
    const step = steps[idx] || null;
    return { index: idx, mode: step?.mode || 'outdoor', step };
  }, [steps, indoorsEnabled, manualStepIndex, outdoorStepIndex]);

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

  useEffect(() => {
    if (!startedFromPlace) {
      setManualStepIndex(null);
    }
    lastModeRef.current = null;
  }, [route, startedFromPlace]);

  const advanceStep = useCallback(() => {
    setManualStepIndex((prev) => {
      const from = prev === null ? currentStep.index : prev;
      if (from >= steps.length - 1) return from;
      return from + 1;
    });
  }, [currentStep.index, steps.length]);

  const distanceRemainingM =
    currentStep.mode === 'indoor' ? 0 : outdoor.distanceRemainingM;
  const distanceToNextStepM =
    currentStep.mode === 'indoor' ? 0 : outdoor.distanceToNextStepM;
  const progress =
    currentStep.mode === 'indoor'
      ? steps.length > 1
        ? currentStep.index / (steps.length - 1)
        : 1
      : outdoor.progress;

  const indoorLevel =
    currentStep.mode === 'indoor' && currentStep.step
      ? currentStep.step.level || null
      : null;

  const indoorBuildingName =
    currentStep.mode === 'indoor' && currentStep.step
      ? currentStep.step.building_name || null
      : null;

  const currentStepGeometryPoint = useMemo(() => {
    if (currentStep.mode !== 'indoor') return null;
    if (!route?.geometry) return null;
    const step = currentStep.step;
    if (!step || step.geometry_index == null) return null;
    return route.geometry[step.geometry_index] || null;
  }, [currentStep.mode, currentStep.step, route?.geometry]);

  const indoorGeometryByLevel = useMemo(() => {
    if (!route?.geometry || !steps.length) return [];
    const indoorSteps = steps.filter(
      (s) => s.mode === 'indoor' && s.geometry_index != null
    );
    if (indoorSteps.length === 0) return [];
    const points = [];
    for (let i = 0; i < indoorSteps.length; i++) {
      const step = indoorSteps[i];
      const startIdx = step.geometry_index;
      const endIdx =
        i + 1 < indoorSteps.length
          ? indoorSteps[i + 1].geometry_index
          : route.geometry.length - 1;
      for (let gi = startIdx; gi <= endIdx; gi++) {
        const pt = route.geometry[gi];
        if (!pt) continue;
        points.push({ lat: pt.lat, lon: pt.lon, level: step.level || null });
      }
    }
    return points;
  }, [route?.geometry, steps]);

  const indoorGeometry = useMemo(
    () => indoorGeometryByLevel.map(({ lat, lon }) => ({ lat, lon })),
    [indoorGeometryByLevel]
  );

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
    indoorLevel,
    indoorBuildingName,
    indoorGeometry,
    indoorGeometryByLevel,
    indoorDestination,
    currentStepGeometryPoint,
  };
}