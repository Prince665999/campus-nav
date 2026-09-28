// Reads and writes the student's program/year selection.
//
// The selection is a single integer — the program_year_id — stored
// in the same settings blob as language, units, and the rest. This
// hook is a thin wrapper that also exposes a change callback so
// screens can react to it.
//
// Nothing about this requires a login. The selection is device-local
// and invisible to the server beyond the program_year_id sent in
// API calls.

import { useCallback } from 'react';

import { useSettings } from '@/context/SettingsContext';

export function useTimetableSelection() {
  const { settings, updateSetting } = useSettings();

  const programYearId = settings.programYearId ?? null;
  const hasSelection = programYearId != null;

  const setSelection = useCallback(
    (newProgramYearId) => {
      updateSetting('programYearId', newProgramYearId);
    },
    [updateSetting]
  );

  const clearSelection = useCallback(() => {
    updateSetting('programYearId', null);
  }, [updateSetting]);

  return {
    programYearId,
    hasSelection,
    setSelection,
    clearSelection,
  };
}