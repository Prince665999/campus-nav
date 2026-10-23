// App-wide configuration read from environment variables and shared
// constants.

const DEFAULT_API_BASE_URL = 'http://192.168.100.148:8000';

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


// Indoor floor plan colours - used in components/IndoorMapView.jsx
//
// Background = outside the building (same as the home screen).
// Interior   = floor space inside the building outline (indoor=level polygon)
//              that is neither a room nor a corridor.



// ---- In mobile/constants/config.js, REPLACE the whole indoor colour block
// ---- with this one. It adds 5 new lines (corridor, room, outlines) and
// ---- changes the colours so corridors, rooms, the building and the outside
// ---- are all clearly different. Nothing else changes.

// Indoor floor plan colours - used in components/IndoorMapView.jsx
//
// From the outside in:
//   BACKGROUND  the ground outside the building
//   INTERIOR    floor space inside the building outline that is neither a
//               room nor a corridor (the indoor=level polygon)
//   CORRIDOR    corridors
//   ROOM        rooms
//   STAIRS      stairwells (indoor=stairs)

// ---- Palette A "Fresh" (default): white corridors, pale-green rooms ----
export const INDOOR_BACKGROUND_COLOR = "#dbe3e8";
export const INDOOR_INTERIOR_COLOR = "#f6efdd";
export const INDOOR_CORRIDOR_COLOR = "#ffffff";
export const INDOOR_CORRIDOR_OUTLINE_COLOR = "#c5d0d8";
export const INDOOR_ROOM_COLOR = "#e3f1e7";
export const INDOOR_ROOM_OUTLINE_COLOR = "#6c9a80";
export const INDOOR_STAIRS_COLOR = "#f4b860";
export const INDOOR_STAIRS_OUTLINE_COLOR = "#b45309";

// ---- Palette B "Warm" (to try it, replace the 8 lines above with these) ----
// export const INDOOR_BACKGROUND_COLOR = "#e3e9ee";
// export const INDOOR_INTERIOR_COLOR = "#f8f2e2";
// export const INDOOR_CORRIDOR_COLOR = "#efdfb9";
// export const INDOOR_CORRIDOR_OUTLINE_COLOR = "#d2bf8c";
// export const INDOOR_ROOM_COLOR = "#ffffff";
// export const INDOOR_ROOM_OUTLINE_COLOR = "#7b8590";
// export const INDOOR_STAIRS_COLOR = "#f0904a";
// export const INDOOR_STAIRS_OUTLINE_COLOR = "#9a3412";

// Line widths
export const INDOOR_ROOM_OUTLINE_WIDTH = 1;
export const INDOOR_BUILDING_OUTLINE_COLOR = "#334155";
export const INDOOR_BUILDING_OUTLINE_WIDTH = 2.5;

// How far the indoor map turns, in degrees, while you walk. The map turns so
// the corridor ahead points up the screen, in steps of this size.
//   90   N, E, S, W only      45   also NE, SE, SW, NW   <- default
//   22.5 16 directions, for buildings at odd angles
//   0    exact direction, no snapping
export const INDOOR_HEADING_SNAP_DEG = 0;

// ---- Room names ----
// A name is shown only from the zoom at which it fits inside its room, so a
// long name never spills over the next room. Names are smaller when zoomed
// out and reach full size at INDOOR_LABEL_FULL_SIZE_ZOOM.
export const INDOOR_LABEL_MIN_SIZE = 8; // text size when zoomed out
export const INDOOR_LABEL_MAX_SIZE = 11; // text size when zoomed in
export const INDOOR_LABEL_FULL_SIZE_ZOOM = 19; // zoom where full size is reached
export const INDOOR_LABEL_WRAP_EM = 7; // long names wrap into lines this wide
// How strictly a name must fit inside its room:
//   1.0  fully inside the room (fewest names when zoomed out)
//   1.3  may touch the walls a little   <- default
//   1.6+ more names earlier, but they may spill over
export const INDOOR_LABEL_FIT = 1.3;
