import { labelPointsFor } from '@/utils/basemapLabels';

const square = (name) => ({
  type: 'Feature',
  properties: name ? { name } : {},
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] },
});

describe('labelPointsFor', () => {
  test('one point at the middle of each named polygon', () => {
    const out = labelPointsFor({ type: 'FeatureCollection', features: [square('Library')] });
    expect(out.features.length).toBe(1);
    expect(out.features[0].properties.name).toBe('Library');
    expect(out.features[0].geometry.type).toBe('Point');
    const [lon, lat] = out.features[0].geometry.coordinates;
    expect(Math.abs(lon - 1) < 1e-9 && Math.abs(lat - 1) < 1e-9).toBe(true);
  });

  test('unnamed shapes get no label', () => {
    const out = labelPointsFor({ type: 'FeatureCollection', features: [square(null), square('Hall')] });
    expect(out.features.length).toBe(1);
  });

  test('a shape that carries a symbol gets no label (its name goes under the symbol)', () => {
    const library = square('Library');
    library.properties.poi = true;
    const out = labelPointsFor({ type: 'FeatureCollection', features: [library, square('Hostel')] });
    expect(out.features.map((f) => f.properties.name)).toEqual(['Hostel']);
  });

  test('missing or empty data does not crash', () => {
    expect(labelPointsFor(null).features).toEqual([]);
    expect(labelPointsFor({ features: [{ properties: { name: 'x' } }] }).features).toEqual([]);
  });
});
