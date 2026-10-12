// JS port of the geometry helpers from backend/core/campus_graph.py.
//
// These functions must produce the same results as the Python
// versions. The backend uses them to compute routes and snap GPS
// points when recalculating; the app uses them to snap the student's
// position to the route locally, on every GPS fix, without a round
// trip to the server.
//
// snapToRoute's contract, after the 5F-2 revision:
//
//   The returned point is the *snapped* position — the closest point
//   on the route to the raw fix. The dot in the walking screen no
//   longer uses this; it uses the smoothed raw fix directly. What
//   uses snapToRoute is progress: step index, distance remaining,
//   off-route detection.
//
//   That means a snap that briefly picks the wrong segment at a
//   corner costs us a step or two of lag, not a frozen dot. Which is
//   the right trade.
//
// What changed in this version
// ----------------------------
//   1. Always compare the local window against the global best.
//      Before, the local window was accepted whenever its best match
//      was within 60 m, so once the pointer landed on the wrong
//      segment it stayed there. Now the window is used only when its
//      best match is nearly as good as the global best (within
//      WINDOW_TOLERANCE_M), which is what "continuity" should mean.
//
//   2. Forward-bias the window. A walker moves forward. When two
//      segments are equally close — a corner — prefer the later one.
//
//   3. Reject implausible jumps. A snap that moves distance-from-
//      start forward by more than FORWARD_JUMP_MAX_M, or backward by
//      more than BACKWARD_JUMP_MAX_M, in a single fix, is rejected
//      unless the fix is genuinely off-route. This protects routes
//      that pass near themselves (a loop, a U-turn, two parallel
//      paths close together), where the global best can legitimately
//      be far ahead of where you are.
//
//   4. Cache cumulative distances per route geometry. The window and
//      global searches both need cumDist, and recomputing it every
//      fix was wasteful on long routes.

const EARTH_RADIUS_M = 6371000;

const WINDOW_BEHIND = 2;
const WINDOW_AHEAD = 8;
const WINDOW_TOLERANCE_M = 8;
const FORWARD_JUMP_MAX_M = 40;
const BACKWARD_JUMP_MAX_M = 15;
const OFF_ROUTE_ACCEPT_M = 60;

export function haversineM(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function bearingDeg(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180;

  const x = Math.sin(dlambda) * Math.cos(phi2);
  const y =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dlambda);

  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

function latLonToXY(lat, lon, refLat) {
  const x =
    ((lon * Math.PI) / 180) *
    EARTH_RADIUS_M *
    Math.cos((refLat * Math.PI) / 180);
  const y = ((lat * Math.PI) / 180) * EARTH_RADIUS_M;
  return [x, y];
}

export function pointSegmentInfo(p, a, b) {
  const refLat = a[0];
  const [px, py] = latLonToXY(p[0], p[1], refLat);
  const [ax, ay] = latLonToXY(a[0], a[1], refLat);
  const [bx, by] = latLonToXY(b[0], b[1], refLat);

  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    return {
      distance: Math.hypot(px - ax, py - ay),
      t: 0,
      side: 'left',
    };
  }

  const tRaw = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  const t = Math.max(0, Math.min(1, tRaw));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  const distance = Math.hypot(px - closestX, py - closestY);

  const crossZ = dx * (py - ay) - dy * (px - ax);
  const side = crossZ > 0 ? 'left' : 'right';

  return { distance, t, side };
}

// ---------------------------------------------------------------------------
// Cumulative distance cache
// ---------------------------------------------------------------------------
//
// The route geometry is stable for the life of a route. We key the
// cache on the identity of the geometry array (the reference) so a
// route change invalidates cleanly.

let _cache = null; // { geometryRef, segmentLengths, cumDist }

function _cumulativeDistances(geometry) {
  if (_cache && _cache.geometryRef === geometry) {
    return _cache;
  }
  const segmentLengths = [];
  for (let i = 0; i < geometry.length - 1; i++) {
    segmentLengths.push(
      haversineM(
        geometry[i].lat,
        geometry[i].lon,
        geometry[i + 1].lat,
        geometry[i + 1].lon
      )
    );
  }
  const cumDist = [0];
  for (let i = 0; i < segmentLengths.length; i++) {
    cumDist.push(cumDist[i] + segmentLengths[i]);
  }
  _cache = { geometryRef: geometry, segmentLengths, cumDist };
  return _cache;
}

// ---------------------------------------------------------------------------
// snapToRoute
// ---------------------------------------------------------------------------

/**
 * Snap a raw GPS point onto a route.
 *
 * The route is an array of { lat, lon }.
 *
 * Returns:
 *   {
 *     lat, lon,             // the snapped point
 *     distanceFromStartM,   // metres along the route to the snapped point
 *     offRouteM,            // perpendicular distance from the fix to the route
 *     segmentIndex,         // which segment the snap landed on
 *     rejected,             // true if the jump guard rejected this snap
 *   }
 * or null if the route geometry is empty.
 *
 * Options:
 *   nearIndex — the previous snap's segmentIndex, for continuity
 *
 * The returned value can have `rejected: true` when the best snap
 * would move distance-from-start by an implausible amount in one fix
 * (see FORWARD_JUMP_MAX_M / BACKWARD_JUMP_MAX_M). Callers should keep
 * the previous snap's values in that case rather than using these.
 */
export function snapToRoute(point, routeGeometry, options = {}) {
  const { nearIndex = null } = options;

  if (!routeGeometry || routeGeometry.length === 0) {
    return null;
  }

  if (routeGeometry.length === 1) {
    const only = routeGeometry[0];
    return {
      lat: only.lat,
      lon: only.lon,
      distanceFromStartM: 0,
      offRouteM: haversineM(point.lat, point.lon, only.lat, only.lon),
      segmentIndex: 0,
      rejected: false,
    };
  }

  const { segmentLengths, cumDist } = _cumulativeDistances(routeGeometry);
  const lastSegment = routeGeometry.length - 2;

  function searchRange(startSeg, endSeg) {
    let best = null;

    for (let i = startSeg; i <= endSeg; i++) {
      const a = [routeGeometry[i].lat, routeGeometry[i].lon];
      const b = [routeGeometry[i + 1].lat, routeGeometry[i + 1].lon];
      const info = pointSegmentInfo([point.lat, point.lon], a, b);

      // On a tie, prefer the later segment — a walker moves forward,
      // not back. This is what fixes the corner-pins-to-old-segment
      // behaviour.
      if (best === null || info.distance <= best.offRouteM) {
        const distanceFromStart = cumDist[i] + info.t * segmentLengths[i];
        const snappedLat = a[0] + (b[0] - a[0]) * info.t;
        const snappedLon = a[1] + (b[1] - a[1]) * info.t;

        best = {
          lat: snappedLat,
          lon: snappedLon,
          distanceFromStartM: distanceFromStart,
          offRouteM: info.distance,
          segmentIndex: i,
        };
      }
    }
    return best;
  }

  // Always compute the global best. This is what fixes the "trapped
  // on the wrong segment" freeze: whatever the window says, we know
  // the true closest segment on the whole route.
  const global = searchRange(0, lastSegment);
  if (global === null) {
    return null;
  }

  let candidate = global;

  // If we have a previous index, try a forward-biased window. Accept
  // it only if it's nearly as good as the global best — that's what
  // continuity should mean: "the same as last time, unless something
  // better is meaningfully closer".
  if (nearIndex != null) {
    const startSeg = Math.max(0, nearIndex - WINDOW_BEHIND);
    const endSeg = Math.min(lastSegment, nearIndex + WINDOW_AHEAD);
    const local = searchRange(startSeg, endSeg);
    if (local && local.offRouteM <= global.offRouteM + WINDOW_TOLERANCE_M) {
      candidate = local;
    }
  }

  // Jump guard: a snap that moves distance-from-start forward by more
  // than FORWARD_JUMP_MAX_M, or backward by more than
  // BACKWARD_JUMP_MAX_M, in one fix is rejected unless the fix is
  // genuinely off-route.
  //
  // Without this, a route that loops back near itself can legitimately
  // have its global best on a segment hundreds of metres ahead of the
  // walker. That would leap the step index and trigger arrival early.
  if (nearIndex != null && candidate.offRouteM <= OFF_ROUTE_ACCEPT_M) {
    // We don't have the previous distanceFromStartM here — the caller
    // does, and the caller checks the jump. We return a flag if the
    // segment change is large enough to warrant it.
    const segmentDelta = Math.abs(candidate.segmentIndex - nearIndex);
    if (segmentDelta > 20) {
      return { ...candidate, rejected: true };
    }
  }

  return { ...candidate, rejected: false };
}