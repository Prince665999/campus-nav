// One label point per named area (building, grass area...), at the visual
// centre of the shape, so each name sits in the middle of what it names.
// Shapes marked `poi` carry a symbol and show their name under it, so they
// get no label here.

import { polygonLabelPoint } from '@/utils/polygonLabel';

/** FeatureCollection of polygons -> FeatureCollection of named Points. */
export function labelPointsFor(featureCollection) {
  const features = [];
  for (const feature of featureCollection?.features ?? []) {
    const name = feature?.properties?.name;
    const ring = feature?.geometry?.coordinates?.[0];
    if (!name || !ring || feature.properties.poi) continue;
    const point = polygonLabelPoint(ring);
    if (!point) continue;
    features.push({
      type: 'Feature',
      properties: { name },
      geometry: { type: 'Point', coordinates: point },
    });
  }
  return { type: 'FeatureCollection', features };
}
