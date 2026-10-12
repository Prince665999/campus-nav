// Helpers for indoor routes.
//
// A route's `steps` carry an optional `geometry_index` — the position
// in `route.geometry` where that step's node sits. Indoor steps
// always have one. Outdoor steps do not.
//
// `indoorRoutePoints(route)` walks the step list, gathers every
// indoor step's geometry index, and fills the gaps between them with
// the intermediate geometry points. The result is a per-point list
// tagged with the level the point is on:
//
//     [{ lat, lon, level }, ...]
//
// The indoor map view uses this to draw the route. Points on the
// currently displayed floor are drawn solid; points on other floors
// are drawn dashed. That's why we tag each point with its level —
// the map view groups them at draw time.
//
// The walking hook (useRouteProgress) currently has its own inline
// version of this. It is deliberately not refactored to call this
// helper in this pass, to avoid touching the walking screen that we
// just stabilised. When the two are eventually unified, this is the
// version to keep.

/**
 * Build the list of indoor route points from a route object.
 *
 * @param {object|null} route — a route with `geometry` and `steps`
 * @returns {Array<{lat:number, lon:number, level:string|null}>}
 */
export function indoorRoutePoints(route) {
  if (!route) return [];
  const geometry = route.geometry;
  const steps = route.steps;
  if (!Array.isArray(geometry) || geometry.length === 0) return [];
  if (!Array.isArray(steps) || steps.length === 0) return [];

  const indoorSteps = steps.filter(
    (s) => s.mode === 'indoor' && s.geometry_index != null
  );
  if (indoorSteps.length === 0) return [];

  const points = [];
  for (let i = 0; i < indoorSteps.length; i++) {
    const step = indoorSteps[i];
    const startIdx = step.geometry_index;
    const endIdx =
      i + 1 < indoorSteps.length
        ? indoorSteps[i + 1].geometry_index
        : geometry.length - 1;
    if (startIdx < 0 || startIdx >= geometry.length) continue;

    for (let gi = startIdx; gi <= endIdx; gi++) {
      if (gi < 0 || gi >= geometry.length) continue;
      const pt = geometry[gi];
      if (!pt) continue;
      points.push({
        lat: pt.lat,
        lon: pt.lon,
        level: step.level || null,
      });
    }
  }
  return points;
}

/**
 * True when a route stays inside a single building and never goes
 * outdoors.
 *
 * Rules:
 *   - There is at least one step.
 *   - Every step is indoor.
 *   - Every step's building_name is the same non-empty string.
 *
 * Any violation makes this false, and the caller should fall back to
 * the outdoor map. That's the honest answer for a mixed route: the
 * student is walking across campus too.
 */
export function isSingleBuildingIndoorRoute(route) {
  if (!route || !Array.isArray(route.steps) || route.steps.length === 0) {
    return false;
  }
  const steps = route.steps;
  if (!steps.every((s) => s.mode === 'indoor')) return false;

  const names = new Set(
    steps.map((s) => (s.building_name || '').trim())
  );
  if (names.has('')) return false;
  if (names.size !== 1) return false;
  return true;
}

/**
 * The building name for a single-building indoor route, or null.
 */
export function singleBuildingName(route) {
  if (!isSingleBuildingIndoorRoute(route)) return null;
  const first = route.steps[0];
  return (first.building_name || '').trim() || null;
}

/**
 * The starting level for a single-building indoor route. Uses the
 * first indoor step's level. Defaults to '0' when absent.
 */
export function singleBuildingStartLevel(route) {
  if (!isSingleBuildingIndoorRoute(route)) return '0';
  const first = route.steps[0];
  return String(first.level ?? '0');
}