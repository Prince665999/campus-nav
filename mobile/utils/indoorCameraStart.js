// Where the indoor map's camera starts, and how close.
//
//   Walking: on the blue dot, at focusZoom.
//   Preview, or a floor you are not on: the route on that floor if it fits
//     at previewMinZoom or closer; otherwise its start at previewMinZoom.
//   No route on the floor: the middle of the floor at the whole-floor zoom
//     (the old behaviour).
//
// Pure maths, so it can be tested. Used by components/IndoorMapView.jsx.

/**
 * @param {object} p
 * @param {{lat:number, lon:number}|null} p.here   the blue dot, if it is on this floor
 * @param {Array<{lat:number, lon:number}>} p.routeHere  the route points on this floor
 * @param {[number, number]} p.floorCenter  [lon, lat] of the whole floor
 * @param {number} p.floorFitZoom  zoom that fits the whole floor
 * @param {number} p.cosLat  cos(latitude), for metres per degree
 * @param {number} p.minDim  the smaller screen dimension of the map, in px
 * @param {number} p.focusZoom
 * @param {number} p.previewMinZoom
 * @returns {{ center: [number, number], zoom: number }}
 */
export function chooseIndoorCamera({
  here,
  routeHere,
  floorCenter,
  floorFitZoom,
  cosLat,
  minDim,
  focusZoom,
  previewMinZoom,
}) {
  if (here) {
    return { center: [here.lon, here.lat], zoom: focusZoom };
  }

  if (routeHere && routeHere.length > 0) {
    let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
    for (const p of routeHere) {
      west = Math.min(west, p.lon);
      east = Math.max(east, p.lon);
      south = Math.min(south, p.lat);
      north = Math.max(north, p.lat);
    }
    const diagM = Math.hypot(
      Math.abs(east - west) * 111320 * cosLat,
      Math.abs(north - south) * 110540
    );
    // Web Mercator: metres per pixel at zoom z is (78271.5 * cosLat) / 2^z.
    // 0.8 leaves a margin so the route does not touch the edges.
    const metresPerPx = Math.max(diagM, 1) / Math.max(minDim * 0.8, 1);
    const routeFitZoom = Math.log2((78271.5 * cosLat) / metresPerPx);

    if (routeFitZoom >= previewMinZoom) {
      return {
        center: [(west + east) / 2, (south + north) / 2],
        zoom: Math.min(routeFitZoom, focusZoom + 0.5),
      };
    }
    return { center: [routeHere[0].lon, routeHere[0].lat], zoom: previewMinZoom };
  }

  return { center: floorCenter, zoom: floorFitZoom };
}
