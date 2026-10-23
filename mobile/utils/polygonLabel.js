// Where to put a room's name: the visual centre of the room.
//
// The map used to let MapLibre choose, and it chose differently for rooms at
// an angle, long thin rooms, and rooms cut by a map-tile edge, so names sat
// off-centre. This works out one point per room, the same way every time.
//
// polygonLabelPoint(ring) -> [lon, lat]
//   ring: [[lon, lat], ...] (closed or not)
//
// It returns the centre of mass of the shape. If that falls outside the room
// (an L or U shaped room), it returns the point inside the room that is
// furthest from every wall instead.

/** Drop a repeated closing point. */
function open(ring) {
  const pts = ring.slice();
  if (
    pts.length > 1 &&
    pts[0][0] === pts[pts.length - 1][0] &&
    pts[0][1] === pts[pts.length - 1][1]
  ) {
    pts.pop();
  }
  return pts;
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToEdges(x, y, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

/** The point inside `poly` furthest from its walls (grid search, refined). */
function innermostPoint(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  let best = null;
  let bestDist = -1;
  let cell = Math.max(maxX - minX, maxY - minY) / 24;
  let x0 = minX, x1 = maxX, y0 = minY, y1 = maxY;

  for (let round = 0; round < 4 && cell > 0; round++) {
    for (let x = x0; x <= x1; x += cell) {
      for (let y = y0; y <= y1; y += cell) {
        if (!pointInPolygon(x, y, poly)) continue;
        const d = distanceToEdges(x, y, poly);
        if (d > bestDist) {
          bestDist = d;
          best = [x, y];
        }
      }
    }
    if (!best) break;
    // Look again, more finely, around the best point so far.
    x0 = best[0] - cell; x1 = best[0] + cell;
    y0 = best[1] - cell; y1 = best[1] + cell;
    cell /= 5;
  }
  return best;
}

export function polygonLabelPoint(ring) {
  if (!ring || ring.length === 0) return null;
  const pts = open(ring);
  if (pts.length === 0) return null;

  // Flatten lat/lon to a local x/y so distances and angles are right.
  const meanLat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const kx = Math.cos((meanLat * Math.PI) / 180);
  const poly = pts.map(([lon, lat]) => [lon * kx, lat]);
  const back = ([x, y]) => [x / kx, y];

  const average = () =>
    back([
      poly.reduce((s, p) => s + p[0], 0) / poly.length,
      poly.reduce((s, p) => s + p[1], 0) / poly.length,
    ]);

  if (poly.length < 3) return average();

  // Centre of mass (shoelace formula).
  let area2 = 0, cx = 0, cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xj, yj] = poly[j];
    const [xi, yi] = poly[i];
    const cross = xj * yi - xi * yj;
    area2 += cross;
    cx += (xj + xi) * cross;
    cy += (yj + yi) * cross;
  }
  if (Math.abs(area2) < 1e-18) return average(); // a flat sliver

  const centroid = [cx / (3 * area2), cy / (3 * area2)];
  if (pointInPolygon(centroid[0], centroid[1], poly)) return back(centroid);

  const inner = innermostPoint(poly);
  return inner ? back(inner) : average();
}

/**
 * polygonLabelInfo(ring) -> { point: [lon, lat], radiusM }
 *
 * Same point as polygonLabelPoint, plus the radius in metres of the biggest
 * circle that fits inside the room around that point (the distance to the
 * nearest wall). A name fits in a room only if it fits inside that circle,
 * which does not change when the map turns.
 */
export function polygonLabelInfo(ring) {
  const point = polygonLabelPoint(ring);
  if (!point) return null;

  const pts = open(ring);
  if (pts.length < 3) return { point, radiusM: 0 };

  const kx = 111320 * Math.cos((point[1] * Math.PI) / 180); // metres per degree of longitude here
  const ky = 110540; // metres per degree of latitude
  const poly = pts.map(([lon, lat]) => [(lon - point[0]) * kx, (lat - point[1]) * ky]);
  return { point, radiusM: distanceToEdges(0, 0, poly) };
}
