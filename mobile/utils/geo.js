// JS port of the geometry helpers from backend/core/campus_graph.py.
//
// These functions must produce the same results as the Python
// versions. The backend uses them to compute routes and snap GPS
// points when recalculating; the app uses them to snap the student's
// position to the route locally, on every GPS fix, without a round
// trip to the server.
//
// The math is identical to the Python. If the Python changes, these
// must change with it. The tests in __tests__/geo.test.js check
// specific known values to catch drift.

const EARTH_RADIUS_M = 6371000;

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

// Flat local projection: metres east and north of a reference latitude.
// Fine for a campus-sized area, which is why the backend uses it too.
function latLonToXY(lat, lon, refLat) {
  const x = ((lon * Math.PI) / 180) * EARTH_RADIUS_M * Math.cos((refLat * Math.PI) / 180);
  const y = ((lat * Math.PI) / 180) * EARTH_RADIUS_M;
  return [x, y];
}

// Project point p onto segment a->b.
//
// Returns { distance, t, side }:
//   distance — perpendicular distance in metres
//   t        — 0..1, how far along the segment the closest point lies
//   side     — "left" or "right" of the direction of travel from a to b
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

// Snap a raw GPS point onto a route.
//
// The route is an array of { lat, lon }. Returns the closest point
// on the route as { lat, lon, distanceFromStartM, offRouteM,
// segmentIndex }.
//
// Forward-constrained search
// --------------------------
// On a campus, footpaths loop back on themselves — a spur, a path
// that returns near its own start, a loop around a building. If the
// search always looks at the whole route, a segment that's
// geometrically close to the student but far along the route can
// "win" the distance comparison and cause the dot to leap. And at
// corners, two segments share a vertex, so the perpendicular
// projection onto the segment the student just left clamps to that
// vertex and pins the dot there for several metres.
//
// To prevent both, we constrain the search to a window of segments
// around the last-known index. Pass `nearIndex` from the previous
// snap. If the best match inside the window is worse than
// `fallbackThresholdM` (or `nearIndex` is null), we re-run the
// search over the whole route. So the worst case is exactly the
// old behaviour; the common case is faster and more correct.
//
// Defaults:
//   nearIndex           — null (full search)
//   window              — 6 segments on either side of nearIndex
//   fallbackThresholdM  — 60 metres
export function snapToRoute(point, routeGeometry, options = {}) {
  const {
    nearIndex = null,
    window = 6,
    fallbackThresholdM = 60,
  } = options;

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
    };
  }

  // Precompute segment lengths so we can translate (segment index, t)
  // into a distance-from-start.
  const segmentLengths = [];
  for (let i = 0; i < routeGeometry.length - 1; i++) {
    const len = haversineM(
      routeGeometry[i].lat,
      routeGeometry[i].lon,
      routeGeometry[i + 1].lat,
      routeGeometry[i + 1].lon
    );
    segmentLengths.push(len);
  }

  // Cumulative distance to the start of each segment, so we can
  // compute distanceFromStartM in O(1) once we know the winning
  // segment and its t.
  const cumDist = [0];
  for (let i = 0; i < segmentLengths.length; i++) {
    cumDist.push(cumDist[i] + segmentLengths[i]);
  }

  // The per-segment search. `startSeg` and `endSeg` are inclusive
  // segment indices; the loop runs from startSeg to endSeg.
  function searchRange(startSeg, endSeg) {
    let bestLocal = null;
    let bestLocalIndex = -1;

    for (let i = startSeg; i <= endSeg; i++) {
      const a = [routeGeometry[i].lat, routeGeometry[i].lon];
      const b = [routeGeometry[i + 1].lat, routeGeometry[i + 1].lon];
      const info = pointSegmentInfo([point.lat, point.lon], a, b);

      if (bestLocal === null || info.distance < bestLocal.distance) {
        const distanceFromStart = cumDist[i] + info.t * segmentLengths[i];
        const snappedLat = a[0] + (b[0] - a[0]) * info.t;
        const snappedLon = a[1] + (b[1] - a[1]) * info.t;

        bestLocal = {
          lat: snappedLat,
          lon: snappedLon,
          distanceFromStartM: distanceFromStart,
          offRouteM: info.distance,
          segmentIndex: i,
        };
        bestLocalIndex = i;
      }
    }

    return bestLocal;
  }

  const lastSegment = routeGeometry.length - 2; // last valid segment index

  // If we have a previous index, try the window first.
  if (nearIndex != null) {
    const startSeg = Math.max(0, nearIndex - window);
    const endSeg = Math.min(lastSegment, nearIndex + window);

    const windowBest = searchRange(startSeg, endSeg);

    // If the window found a good enough match, use it. Otherwise fall
    // through to a full search — the snap has drifted and we need to
    // re-find ourselves.
    if (windowBest !== null && windowBest.offRouteM <= fallbackThresholdM) {
      return windowBest;
    }
  }

  // Full search — first fix, no nearIndex, or the window failed.
  return searchRange(0, lastSegment);
}