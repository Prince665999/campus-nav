// Which way the outdoor map faces when the walking screen opens, before the
// compass or GPS has any direction to give.
//
// The route preview turns the map to face the route (north-up or south-up, and
// the student may flip it). The walking screen used to open facing north until
// the student started moving, so a student who started walking the wrong way
// had nothing to correct them. Now the walking screen opens facing the SAME
// way the preview did, and switches to the live heading once there is one.
//
// The preview remembers its heading here. If the walking screen is opened
// without a preview (or for a different route), the heading is worked out the
// same way the preview does it: from the route's first point to its last.

import { bearingDeg } from '@/utils/geo';

let remembered = { key: null, heading: null };

// First and last point to about 100 m, so a route recomputed a few metres
// away is still the same route.
export function routeKey(coords) {
  if (!coords || coords.length < 2) return null;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const r = (n) => Number(n).toFixed(3);
  return `${r(first[0])},${r(first[1])}>${r(last[0])},${r(last[1])}`;
}

/** The preview's base heading for a route: 0 (north up) or 180 (south up). */
export function routeBaseHeading(coords) {
  if (!coords || coords.length < 2) return null;
  const first = coords[0]; // [lon, lat]
  const last = coords[coords.length - 1];
  const bearing = bearingDeg(first[1], first[0], last[1], last[0]);
  return Math.cos((bearing * Math.PI) / 180) >= 0 ? 0 : 180;
}

/** Called by the preview whenever the map heading it shows changes. */
export function rememberPreviewHeading(coords, heading) {
  if (heading == null) return;
  remembered = { key: routeKey(coords), heading };
}

/** The heading the walking screen should start with, or null for no route. */
export function startHeadingFor(coords) {
  const key = routeKey(coords);
  if (key === null) return null;
  if (remembered.key === key && remembered.heading != null) return remembered.heading;
  return routeBaseHeading(coords);
}

/** For tests. */
export function forgetPreviewHeading() {
  remembered = { key: null, heading: null };
}
