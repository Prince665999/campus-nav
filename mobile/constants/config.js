// App-wide configuration read from environment variables and shared
// constants.

const DEFAULT_API_BASE_URL = 'https://nomination-flour-learn-leeds.trycloudflare.com';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;

export const API_TIMEOUT_MS = 15000;

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_RESULT_LIMIT = 20;

// ---------------------------------------------------------------------------
// GPS accuracy thresholds
//
// These constants work together. Changing one without the others
// can leave the app in a state where the dot freezes, routes silently
// fail, or bad fixes produce wrong routes.
// ---------------------------------------------------------------------------

// The maximum reported accuracy (in metres) a fix is allowed to have
// for the walking dot to accept it as a good fix, which also resets
// the "stale" clock. Fixes worse than this don't reset the clock —
// they're shown if the clock has run out, but not treated as
// authoritative.
//
// Used in: hooks/useWalkingProgress.js
export const DISPLAY_MAX_ACCURACY_M = 60;

// If no good fix arrives in this many milliseconds, accept the best
// available fix anyway — so walking under cover doesn't freeze the
// dot entirely.
//
// Note on the earlier version: this used to be 8 seconds and the
// stale branch reset the clock on every poor fix, so the dot updated
// once every 8 seconds while moving. Now the clock only resets on a
// genuinely good fix, and the window is short enough that a student
// moving at walking pace sees a smooth update.
//
// Used in: hooks/useWalkingProgress.js
export const DISPLAY_STALE_FIX_MS = 3000;

// A fix worse than this is discarded entirely. Network-based
// location often reports 200–2000 m of "accuracy"; those fixes would
// otherwise show as a dot jumping across campus under the 3-second
// stale rule.
//
// Used in: hooks/useWalkingProgress.js
export const DISPLAY_MAX_ACCURACY_HARD_M = 100;

// How long without a good fix before the walking screen shows a
// "searching for GPS" indicator.
//
// Used in: components/InstructionCard.jsx, via useWalkingProgress.
export const DISPLAY_STALE_INDICATOR_S = 4;

// The maximum reported accuracy (in metres) a fix is allowed to have
// before the walking screen's route recompute runs. Recomputes are
// expensive; a bad fix would produce a wrong route.
//
// Used in: app/walking.jsx
export const RECOMPUTE_MAX_ACCURACY_M = 50;

// How long to wait after the first good fix before recomputing the
// route.
//
// Used in: app/walking.jsx
export const RECOMPUTE_AFTER_MS = 2000;

// The maximum reported accuracy (in metres) a fix is allowed to have
// to count as evidence of being off-route. Deliberately looser than
// DISPLAY_MAX_ACCURACY_M. Above this is almost always cell-tower
// noise.
//
// Used in: hooks/useWalkingProgress.js
export const OFF_ROUTE_MAX_ACCURACY_M = 80;

// The off-route distance threshold and the local re-snap threshold
// are related. If the local re-snap threshold is larger than the
// off-route threshold, a student who sees the "off route" banner
// will tap Recalculate, the local re-snap will succeed (because the
// distance is under its larger threshold), and the banner will
// reappear on the next fix. Keep LOCAL_RESNAP_MAX_M <= the off-route
// threshold below.
export const LOCAL_RESNAP_MAX_M = 35;
export const OFF_ROUTE_DISTANCE_M = 35;

// Camera throttle: at most one camera update per this many ms,
// unless the user moved at least this far (m) or the heading changed
// at least this much (deg).
//
// Used in: components/MapView.jsx
export const CAMERA_MIN_INTERVAL_MS = 700;
export const CAMERA_MIN_MOVE_M = 1.5;
export const CAMERA_MIN_HEADING_DEG = 10;

export const INDOOR_BACKGROUND_COLOR = "#f1f5f9";
export const INDOOR_INTERIOR_COLOR = "#fdf3d7";
export const INDOOR_BUILDING_OUTLINE_COLOR = "#334155";
export const INDOOR_BUILDING_OUTLINE_WIDTH = 2.5;
