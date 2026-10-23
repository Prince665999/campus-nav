// Which way the road ahead points, for turning the indoor map.
//
// legBearing(points) -> degrees (0 = north) or null
//   points: [{ lat, lon }, ...] starting at the walker's position, in order
//           along the route.
//
// The old version took the direction to the first path point that was 3 m
// away. On a corridor drawn with small bends or a few extra nodes, that is
// not the direction of the road. This version follows the path for as long as
// it keeps going the same way and returns the straight-line direction from
// the walker to the END of that stretch. It stops at the first real turn
// (more than LEG_TURN_TOLERANCE_DEG), so a corner never drags the answer
// round, and it follows a gentle curve for a while.
//
// Returns null when there is no usable direction (the walker is almost at the
// end of the route), so the caller can keep the previous heading.

import { bearingDeg, haversineM } from '@/utils/geo';

const MIN_FIRST_CHORD_M = 3; // ignore moves smaller than this at the start
const CHORD_M = 2; // after that, look at the path in 2 m pieces
export const LEG_TURN_TOLERANCE_DEG = 25;
export const LEG_MAX_LENGTH_M = 60;

function angleDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function legBearing(points) {
  if (!points || points.length < 2) return null;

  const from = points[0];
  let anchor = from;
  let end = null;
  let reference = null;

  for (let i = 1; i < points.length; i++) {
    const to = points[i];
    if (haversineM(from.lat, from.lon, to.lat, to.lon) > LEG_MAX_LENGTH_M) break;

    const needed = end === null ? MIN_FIRST_CHORD_M : CHORD_M;
    if (haversineM(anchor.lat, anchor.lon, to.lat, to.lon) < needed) continue;

    const piece = bearingDeg(anchor.lat, anchor.lon, to.lat, to.lon);
    if (reference !== null && angleDiff(piece, reference) > LEG_TURN_TOLERANCE_DEG) {
      break; // the path has turned: the road ahead ends here
    }

    end = to;
    anchor = to;
    reference = bearingDeg(from.lat, from.lon, end.lat, end.lon);
  }

  return end ? bearingDeg(from.lat, from.lon, end.lat, end.lon) : null;
}

// ---------------------------------------------------------------------------
// The start and the end of a route
// ---------------------------------------------------------------------------
//
// START. A route that begins in a room starts with a short stub from the
// door into the corridor, then turns onto the corridor. Aiming the map at
// the stub, or at a line across both, shows the corridor at a slant. For the
// first step we skip that stub and aim along the corridor.
//
// END. The last stretch into the destination door is only a metre or two, too
// short to be a "road". There we turn the map to face the destination.

const STUB_MAX_M = 5; // a first stretch shorter than this, ending in a corner, is a door stub
const STUB_CORNER_DEG = 40; // how sharp the corner must be
const MICRO_SEGMENT_M = 0.3; // shorter pieces have no reliable direction
const FACE_TARGET_MIN_M = 0.8; // nearer than this there is no direction to face

function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineM(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  }
  return total;
}

/** Index of the corner that ends a door stub, or -1 when the path has none. */
function stubEndIndex(points) {
  let travelled = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const before = haversineM(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    travelled += before;
    if (travelled > STUB_MAX_M) return -1;
    const after = haversineM(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon);
    if (before < MICRO_SEGMENT_M || after < MICRO_SEGMENT_M) continue;
    const incoming = bearingDeg(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    const outgoing = bearingDeg(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon);
    if (angleDiff(incoming, outgoing) >= STUB_CORNER_DEG) return i;
  }
  return -1;
}

/**
 * The direction the map should face for a step.
 *   points        the route from the walker's position onward, on this floor
 *   isRouteStart  true on the very first step, where the walker stands in a room
 * Returns degrees, or null when there is no direction (the walker is already
 * at the destination), so the caller keeps the previous heading.
 */
export function headingAlongRoute(points, { isRouteStart = false } = {}) {
  if (!points || points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];

  // Last few metres: face the destination.
  if (pathLength(points) < MIN_FIRST_CHORD_M) {
    return haversineM(first.lat, first.lon, last.lat, last.lon) >= FACE_TARGET_MIN_M
      ? bearingDeg(first.lat, first.lon, last.lat, last.lon)
      : null;
  }

  // First step: aim along the corridor, not along the door stub.
  if (isRouteStart) {
    const corner = stubEndIndex(points);
    if (corner > 0) {
      const alongCorridor = legBearing(points.slice(corner));
      if (alongCorridor !== null) return alongCorridor;
    }
  }

  return legBearing(points);
}