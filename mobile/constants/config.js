// App-wide configuration read from environment variables and shared
// constants.

const DEFAULT_API_BASE_URL = 'https://susan-electro-tough-arrested.trycloudflare.com';

export const API_BASE_URL =
process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;

export const API_TIMEOUT_MS = 15000;

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_RESULT_LIMIT = 20;

// ---------------------------------------------------------------------------
// GPS accuracy thresholds
//
// These three constants work together. Changing one without the others
// can leave the app in a state where the dot freezes, routes silently
// fail, or bad fixes produce wrong routes.
// ---------------------------------------------------------------------------

// The maximum reported accuracy (in metres) a fix is allowed to have
// for the walking dot to accept it. Fixes above this are usually
// network-based estimates, not real GPS, and would jump the dot.
//
// Used in: hooks/useWalkingProgress.js
export const DISPLAY_MAX_ACCURACY_M = 40;

// If no fix within DISPLAY_MAX_ACCURACY_M arrives in this many
// milliseconds, accept the best available fix anyway — so walking
// under cover doesn't freeze the dot entirely.
//
// Used in: hooks/useWalkingProgress.js
export const DISPLAY_STALE_FIX_MS = 8000;

// The maximum reported accuracy (in metres) a fix is allowed to have
// before the walking screen's route recompute runs. Recomputes are
// expensive; a bad fix would produce a wrong route. This threshold is
// looser than DISPLAY_MAX_ACCURACY_M because the recompute is more
// tolerant of a slightly noisy fix than the moving dot is.
//
// Used in: app/walking.jsx
export const RECOMPUTE_MAX_ACCURACY_M = 50;

// How long to wait after the first good fix before recomputing the
// route. Long enough for a second fix to confirm, short enough to
// correct before the student has walked far.
//
// Used in: app/walking.jsx
export const RECOMPUTE_AFTER_MS = 2000;