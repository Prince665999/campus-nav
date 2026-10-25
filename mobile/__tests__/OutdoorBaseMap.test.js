// Renders the base map layers with a stand-in for MapLibre and checks what is
// handed to it: every layer present, in the right order, with no crash.

jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const make = (name) => (props) => React.createElement(name, props, props.children);
  return {
    Images: make('Images'),
    ShapeSource: make('ShapeSource'),
    FillLayer: make('FillLayer'),
    LineLayer: make('LineLayer'),
    CircleLayer: make('CircleLayer'),
    SymbolLayer: make('SymbolLayer'),
  };
});

// The picture files are not needed to check the layers.
jest.mock('@/constants/poiIcons', () => ({ POI_IMAGES: { parking: 1, library: 2 } }));

import renderer from 'react-test-renderer';
import { OutdoorBaseMap } from '@/components/OutdoorBaseMap';

const fc = (features) => ({ type: 'FeatureCollection', features });
const poly = (name, kind) => ({
  type: 'Feature',
  properties: name ? { kind, name } : { kind },
  geometry: { type: 'Polygon', coordinates: [[[33.41, -8.94], [33.411, -8.94], [33.411, -8.941], [33.41, -8.941], [33.41, -8.94]]] },
});
const line = (kind) => ({
  type: 'Feature',
  properties: { kind },
  geometry: { type: 'LineString', coordinates: [[33.41, -8.94], [33.412, -8.941]] },
});

const pt = (props) => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'Point', coordinates: [33.4105, -8.9405] },
});

const DATA = {
  version: 'v1',
  bounds: [33.41, -8.941, 33.412, -8.94],
  layers: {
    landuse: fc([poly('Mbeya University', 'education')]),
    green: fc([poly('Quad', 'grass')]),
    water: fc([]),
    waterways: fc([]),
    sports: fc([poly('Volleyball', 'pitch')]),
    parking: fc([{ ...poly(null, 'parking'), properties: { kind: 'parking', poi: true } }]),
    roads: fc([line('residential'), line('service'), line('track'), line('pedestrian')]),
    paths: fc([line('footway'), line('steps')]),
    buildings: fc([
      poly('Hostel', 'yes'),
      poly(null, 'yes'),
      { ...poly('Library', 'yes'), properties: { kind: 'yes', name: 'Library', poi: true } },
    ]),
    pois: fc([pt({ icon: 'medical', name: 'Dispensary' }), pt({ icon: 'parking' }), pt({ name: 'Main Gate' })]),
    trees: fc([pt({})]),
  },
};

const ids = (tree, type) => tree.root.findAllByType(type).map((n) => n.props.id);
const source = (tree, id) => tree.root.findAllByType('ShapeSource').find((s) => s.props.id === id);

test('draws every layer: ground first, then areas, roads, buildings, symbols, names', () => {
  const tree = renderer.create(<OutdoorBaseMap data={DATA} />);
  expect(ids(tree, 'ShapeSource')).toEqual([
    'base-landuse', 'base-green', 'base-water', 'base-waterways', 'base-sports',
    'base-parking', 'base-roads', 'base-paths', 'base-buildings', 'base-trees',
    'base-pois', 'base-landuse-names', 'base-sports-names', 'base-green-names',
    'base-building-names',
  ]);
});

test('registers the symbol pictures with the map', () => {
  const tree = renderer.create(<OutdoorBaseMap data={DATA} />);
  const images = tree.root.findAllByType('Images');
  expect(images.length).toBe(1);
  expect(Object.keys(images[0].props.images)).toEqual(['parking', 'library']);
});

test('every layer id is unique, and none clashes with the route layers', () => {
  const tree = renderer.create(<OutdoorBaseMap data={DATA} />);
  const all = ['FillLayer', 'LineLayer', 'CircleLayer', 'SymbolLayer'].flatMap((t) => ids(tree, t));
  expect(new Set(all).size).toBe(all.length);
  expect(all.every((id) => id.startsWith('base-'))).toBe(true);
});

test('roads: all the grey edges are drawn before any road surface', () => {
  const tree = renderer.create(<OutdoorBaseMap data={DATA} />);
  const lines = ids(tree, 'LineLayer');
  const lastCasing = Math.max(lines.indexOf('base-roads-casing'), lines.indexOf('base-roads-casing-minor'));
  const firstFill = Math.min(lines.indexOf('base-roads-fill'), lines.indexOf('base-roads-fill-minor'));
  expect(lastCasing).toBeLessThan(firstFill);
  expect(lines).toContain('base-roads-track');
});

test('footpaths and steps are separate layers', () => {
  const tree = renderer.create(<OutdoorBaseMap data={DATA} />);
  expect(ids(tree, 'LineLayer')).toEqual(expect.arrayContaining(['base-paths-walk', 'base-paths-steps']));
});

test('names: only named shapes get a label, and shapes with a symbol get none', () => {
  const tree = renderer.create(<OutdoorBaseMap data={DATA} />);
  const names = (id) => source(tree, id).props.shape.features.map((f) => f.properties.name);
  expect(names('base-building-names')).toEqual(['Hostel']);   // not the unnamed one, not the Library (it has a symbol)
  expect(names('base-sports-names')).toEqual(['Volleyball']);
  expect(names('base-green-names')).toEqual(['Quad']);
  expect(names('base-landuse-names')).toEqual(['Mbeya University']);
});

test('symbols: with a picture when there is an icon, name-only otherwise', () => {
  const tree = renderer.create(<OutdoorBaseMap data={DATA} />);
  const [withIcon, textOnly] = tree.root.findAllByType('SymbolLayer').filter((l) => l.props.id.startsWith('base-pois'));
  expect(withIcon.props.style.iconImage).toEqual(['get', 'icon']);
  expect(withIcon.props.filter).toEqual(['has', 'icon']);
  expect(withIcon.props.style.textOptional).toBe(true);        // the symbol shows even if its name does not fit
  expect(textOnly.props.filter).toEqual(['!', ['has', 'icon']]);
});

test('symbol names are coloured by what they are (clinic red, parking blue)', () => {
  const tree = renderer.create(<OutdoorBaseMap data={DATA} />);
  const colour = tree.root.findAllByType('SymbolLayer').find((l) => l.props.id === 'base-pois-icon').props.style.textColor;
  expect(colour[0]).toBe('match');
  expect(colour).toEqual(expect.arrayContaining(['medical', '#bf0000', 'parking', '#0066aa']));
});

test('ground colours follow the kind: the campus is pale yellow, grass is green', () => {
  const tree = renderer.create(<OutdoorBaseMap data={DATA} />);
  const fill = (id) => tree.root.findAllByType('FillLayer').find((l) => l.props.id === id).props.style.fillColor;
  expect(fill('base-landuse-fill')).toEqual(expect.arrayContaining(['education', '#ffffe5']));
  expect(fill('base-green-fill')).toEqual(expect.arrayContaining(['grass', '#cdebb0']));
  expect(fill('base-sports-fill')).toEqual(expect.arrayContaining(['pitch', '#88e0be']));
  expect(tree.root.findAllByType('FillLayer').find((l) => l.props.id === 'base-buildings-fill').props.style.fillColor).toBe('#d9d0c9');
});

test('trees are small dots', () => {
  const tree = renderer.create(<OutdoorBaseMap data={DATA} />);
  expect(ids(tree, 'CircleLayer')).toEqual(['base-trees-dot']);
});

test('labels are centred and upright', () => {
  const tree = renderer.create(<OutdoorBaseMap data={DATA} />);
  const label = tree.root.findAllByType('SymbolLayer').find((l) => l.props.id === 'base-building-names-text').props.style;
  expect(label.textAnchor).toBe('center');
  expect(label.textRotationAlignment).toBe('viewport');
  expect(label.textAllowOverlap).toBe(false);
});

test('missing or empty data draws empty layers without crashing', () => {
  expect(() => renderer.create(<OutdoorBaseMap data={null} />)).not.toThrow();
  expect(() => renderer.create(<OutdoorBaseMap data={{ layers: {} }} />)).not.toThrow();
  const tree = renderer.create(<OutdoorBaseMap data={{ layers: {} }} />);
  const shapes = tree.root.findAllByType('ShapeSource').map((s) => s.props.shape.features.length);
  expect(shapes.every((n) => n === 0)).toBe(true);
});
