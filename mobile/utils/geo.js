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

  // Cross product z-component: positive means p is left of a->b.
  const crossZ = dx * (py - ay) - dy * (px - ax);
  const side = crossZ > 0 ? 'left' : 'right';

  return { distance, t, side };
}

// Snap a raw GPS point onto a route.
//
// The route is an array of { lat, lon }. Returns the closest point
// on the route as { lat, lon, distanceFromStartM, offRouteM },
// where distanceFromStartM is how far along the walk the snapped
// point sits, and offRouteM is how far the raw point was from the
// route.
//
// This is what removes GPS jitter. The raw fix jumps around; the
// snapped point moves smoothly along the route.
export function snapToRoute(point, routeGeometry) {
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

  let best = null;

  for (let i = 0; i < routeGeometry.length - 1; i++) {
    const a = [routeGeometry[i].lat, routeGeometry[i].lon];
    const b = [routeGeometry[i + 1].lat, routeGeometry[i + 1].lon];
    const info = pointSegmentInfo([point.lat, point.lon], a, b);

    if (best === null || info.distance < best.distance) {
      // Distance from start = sum of prior segments + fraction along this one.
      let distanceFromStart = 0;
      for (let j = 0; j < i; j++) {
        distanceFromStart += segmentLengths[j];
      }
      distanceFromStart += info.t * segmentLengths[i];

      // Interpolate the snapped lat/lon.
      const snappedLat = a[0] + (b[0] - a[0]) * info.t;
      const snappedLon = a[1] + (b[1] - a[1]) * info.t;

      best = {
        lat: snappedLat,
        lon: snappedLon,
        distanceFromStartM: distanceFromStart,
        offRouteM: info.distance,
      };
    }
  }

  return best;
}