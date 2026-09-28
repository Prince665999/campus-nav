// API client for the timetable endpoints. Every call goes through
// services/api.js's `request` function so the device ID header and
// timeout handling are consistent with the rest of the app.

import { request } from '@/services/api';

/**
 * Every program, alphabetical. Used by the onboarding picker.
 */
export async function listPrograms() {
  return request('/api/timetable/programs');
}

/**
 * Year-levels available for one program.
 */
export async function listYearsForProgram(programId) {
  return request(`/api/timetable/programs/${programId}/years`);
}

/**
 * Every entry for one program-year, ordered by day and time.
 * Returns { program_year_id, entries: [...] }.
 */
export async function getWeek(programYearId) {
  return request(`/api/timetable/schedule?program_year_id=${programYearId}`);
}

/**
 * The next class within the next 90 minutes, if any.
 * Returns { has_class, entry, starts_in_seconds }.
 *
 * Currently unused — the mobile app computes "next class" locally
 * from the cached week, so this is here for future use or debugging.
 */
export async function getNextClass(programYearId) {
  return request(`/api/timetable/next?program_year_id=${programYearId}`);
}