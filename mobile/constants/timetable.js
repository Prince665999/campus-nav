// Shared constants for the timetable feature.

// Day-of-week names, indexed 0–6 to match the backend's storage.
// Monday is 0, matching the Python model.
export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

// The days shown on the timetable screen tabs. Monday–Friday only.
export const WEEKDAYS = [0, 1, 2, 3, 4];

// i18n keys for each day, so the labels can be translated.
export const DAY_LABEL_KEYS = {
  0: 'timetable.days.monday',
  1: 'timetable.days.tuesday',
  2: 'timetable.days.wednesday',
  3: 'timetable.days.thursday',
  4: 'timetable.days.friday',
  5: 'timetable.days.saturday',
  6: 'timetable.days.sunday',
};

// Short labels for the day tab bar, since the full names are long.
export const DAY_SHORT_LABEL_KEYS = {
  0: 'timetable.days.mon',
  1: 'timetable.days.tue',
  2: 'timetable.days.wed',
  3: 'timetable.days.thu',
  4: 'timetable.days.fri',
  5: 'timetable.days.sat',
  6: 'timetable.days.sun',
};

// Colours for the timetable screen, kept separate from the main theme
// so we can tweak them without touching the rest of the app.
export const TIMETABLE_COLORS = {
  tabActive: '#1e3a8a',
  tabInactive: '#f3f4f6',
  tabActiveText: '#ffffff',
  tabInactiveText: '#374151',
  rowBorder: '#f3f4f6',
  timeColumn: '#4b5563',
  moduleCode: '#111827',
  moduleName: '#4b5563',
  lecturer: '#6b7280',
  venue: '#2563eb',
  crossCutting: '#b45309',
};