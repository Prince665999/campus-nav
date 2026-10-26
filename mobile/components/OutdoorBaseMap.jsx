// OutdoorBaseMap: draws the outdoor map from your own map.osm data
// (ground, grass, pitches, parking, roads, paths, buildings, trees, symbols
// and names) instead of using a map picture from a tile service.
//
// Rendered inside the outdoor <MapView>. It adds layers only; the route line,
// the blue dot, the camera and the heading are drawn by MapView as before and
// sit on top, because these layers are added first.
//
// Layer order, bottom to top:
//   land use -> grass -> water -> sports -> parking -> roads -> paths
//   -> buildings -> trees -> symbols -> names
//
// Symbols come first among the labels, so a symbol is never hidden by a name.

import { useMemo } from 'react';
import {
  Images,
  ShapeSource,
  FillLayer,
  LineLayer,
  CircleLayer,
  SymbolLayer,
} from '@maplibre/maplibre-react-native';

import {
  OUTDOOR_COLORS as C,
  LANDUSE_COLORS,
  GREEN_COLORS,
  SPORTS_FILL,
  SPORTS_LINE,
  POI_TEXT_COLORS,
  kindColor,
  OUTDOOR_LABEL_MIN_ZOOM,
  OUTDOOR_SYMBOL_MIN_ZOOM,
  OUTDOOR_TREE_MIN_ZOOM,
} from '@/constants/outdoorMapStyle';
import { POI_IMAGES } from '@/constants/poiIcons';
import { labelPointsFor } from '@/utils/basemapLabels';

// Line widths grow with the zoom, so a road stays road-shaped from the whole
// campus down to a few metres.
const ROAD_WIDTH = ['interpolate', ['exponential', 1.6], ['zoom'], 14, 0.8, 17, 4, 19, 12, 21, 36];
const ROAD_CASING_WIDTH = ['interpolate', ['exponential', 1.6], ['zoom'], 14, 1.4, 17, 6, 19, 16, 21, 44];
const MINOR_ROAD_WIDTH = ['interpolate', ['exponential', 1.6], ['zoom'], 15, 0.6, 17, 2.4, 19, 7, 21, 22];
const MINOR_ROAD_CASING_WIDTH = ['interpolate', ['exponential', 1.6], ['zoom'], 15, 1.2, 17, 3.6, 19, 9.5, 21, 28];
// Footpaths: wider than before so the white dots read clearly on the milk ground.
const PATH_WIDTH = ['interpolate', ['linear'], ['zoom'], 15, 1, 17, 2.4, 19, 4.6, 21, 9];
const WATERWAY_WIDTH = ['interpolate', ['linear'], ['zoom'], 14, 0.8, 18, 4, 21, 14];
const NAME_SIZE = ['interpolate', ['linear'], ['zoom'], 16, 10, 19, 12];
const ICON_SIZE = ['interpolate', ['linear'], ['zoom'], 15, 0.2, 17, 0.28, 19, 0.38, 21, 0.5];
const TREE_RADIUS = ['interpolate', ['linear'], ['zoom'], 17, 1.5, 19, 3.5, 21, 8];

// Small roads are drawn narrower than main ones.
const MINOR_ROADS = ['service', 'living_street', 'pedestrian', 'track'];
const isKind = (...kinds) => ['in', ['get', 'kind'], ['literal', kinds]];
const isMinor = isKind(...MINOR_ROADS);
const roadFillColor = ['match', ['get', 'kind'], 'pedestrian', C.roadPedestrian, C.road];

const EMPTY = { type: 'FeatureCollection', features: [] };

function nameStyle(color, extra = {}) {
  return {
    textField: ['get', 'name'],
    textFont: ['Noto Sans Regular'],
    textSize: NAME_SIZE,
    textMaxWidth: 7,
    textColor: color,
    textHaloColor: C.halo,
    textHaloWidth: 1.5,
    textAnchor: 'center',
    textJustify: 'center',
    textAllowOverlap: false,
    textRotationAlignment: 'viewport',
    textPitchAlignment: 'viewport',
    ...extra,
  };
}

const POI_TEXT_COLOR = kindColor(POI_TEXT_COLORS, 'icon');

export function OutdoorBaseMap({ data }) {
  const layers = data?.layers ?? {};
  const get = (name) => layers[name] ?? EMPTY;

  // Names sit at the middle of their shape. Shapes that carry a symbol
  // (library, dispensary, parking...) show their name under the symbol
  // instead, so they are left out here.
  const buildingNames = useMemo(() => labelPointsFor(get('buildings')), [data]);
  const sportsNames = useMemo(() => labelPointsFor(get('sports')), [data]);
  const greenNames = useMemo(() => labelPointsFor(get('green')), [data]);
  const landNames = useMemo(() => labelPointsFor(get('landuse')), [data]);

  return (
    <>
      <Images images={POI_IMAGES} />

      <ShapeSource id="base-landuse" shape={get('landuse')}>
        <FillLayer
          id="base-landuse-fill"
          style={{ fillColor: kindColor(LANDUSE_COLORS), fillOpacity: 1 }}
        />
      </ShapeSource>

      <ShapeSource id="base-green" shape={get('green')}>
        <FillLayer
          id="base-green-fill"
          style={{ fillColor: kindColor(GREEN_COLORS), fillOpacity: 1 }}
        />
      </ShapeSource>

      <ShapeSource id="base-water" shape={get('water')}>
        <FillLayer id="base-water-fill" style={{ fillColor: C.water, fillOpacity: 1 }} />
      </ShapeSource>
      <ShapeSource id="base-waterways" shape={get('waterways')}>
        <LineLayer
          id="base-waterways-line"
          style={{ lineColor: C.water, lineWidth: WATERWAY_WIDTH, lineCap: 'round', lineJoin: 'round' }}
        />
      </ShapeSource>

      <ShapeSource id="base-sports" shape={get('sports')}>
        <FillLayer
          id="base-sports-fill"
          style={{ fillColor: kindColor(SPORTS_FILL), fillOpacity: 1 }}
        />
        <LineLayer
          id="base-sports-line"
          style={{ lineColor: kindColor(SPORTS_LINE), lineWidth: 1, lineJoin: 'round' }}
        />
      </ShapeSource>

      <ShapeSource id="base-parking" shape={get('parking')}>
        <FillLayer id="base-parking-fill" style={{ fillColor: C.parkingFill, fillOpacity: 1 }} />
        <LineLayer
          id="base-parking-line"
          style={{ lineColor: C.parkingLine, lineWidth: 1, lineJoin: 'round' }}
        />
      </ShapeSource>

      <ShapeSource id="base-roads" shape={get('roads')}>
        {/* All the grey edges first, then all the roads on top, so junctions are clean. */}
        <LineLayer
          id="base-roads-casing-minor"
          filter={['all', isMinor, ['!=', ['get', 'kind'], 'track']]}
          style={{ lineColor: C.roadCasing, lineWidth: MINOR_ROAD_CASING_WIDTH, lineCap: 'round', lineJoin: 'round' }}
        />
        <LineLayer
          id="base-roads-casing"
          filter={['!', isMinor]}
          style={{ lineColor: C.roadCasing, lineWidth: ROAD_CASING_WIDTH, lineCap: 'round', lineJoin: 'round' }}
        />
        <LineLayer
          id="base-roads-fill-minor"
          filter={['all', isMinor, ['!=', ['get', 'kind'], 'track']]}
          style={{ lineColor: roadFillColor, lineWidth: MINOR_ROAD_WIDTH, lineCap: 'round', lineJoin: 'round' }}
        />
        <LineLayer
          id="base-roads-fill"
          filter={['!', isMinor]}
          style={{ lineColor: roadFillColor, lineWidth: ROAD_WIDTH, lineCap: 'round', lineJoin: 'round' }}
        />
        <LineLayer
          id="base-roads-track"
          filter={isKind('track')}
          style={{ lineColor: C.track, lineWidth: PATH_WIDTH, lineDasharray: [3, 1.5], lineJoin: 'round' }}
        />
      </ShapeSource>

      <ShapeSource id="base-paths" shape={get('paths')}>
        {/* Footpaths are drawn as white dots, steps as short white dashes. */}
        <LineLayer
          id="base-paths-walk"
          filter={['!', isKind('steps')]}
          style={{ lineColor: C.path, lineWidth: PATH_WIDTH, lineDasharray: [0.1, 2], lineCap: 'round' }}
        />
        <LineLayer
          id="base-paths-steps"
          filter={isKind('steps')}
          style={{ lineColor: C.path, lineWidth: PATH_WIDTH, lineDasharray: [0.8, 0.6] }}
        />
      </ShapeSource>

      <ShapeSource id="base-buildings" shape={get('buildings')}>
        <FillLayer id="base-buildings-fill" style={{ fillColor: C.buildingFill, fillOpacity: 1 }} />
        <LineLayer
          id="base-buildings-line"
          style={{ lineColor: C.buildingLine, lineWidth: 1, lineJoin: 'round' }}
        />
      </ShapeSource>

      <ShapeSource id="base-trees" shape={get('trees')}>
        <CircleLayer
          id="base-trees-dot"
          minZoomLevel={OUTDOOR_TREE_MIN_ZOOM}
          style={{
            circleRadius: TREE_RADIUS,
            circleColor: C.treeFill,
            circleStrokeColor: C.treeLine,
            circleStrokeWidth: 0.75,
          }}
        />
      </ShapeSource>

      {/* Symbols and their names (symbols have priority over the names below). */}
      <ShapeSource id="base-pois" shape={get('pois')}>
        <SymbolLayer
          id="base-pois-icon"
          minZoomLevel={OUTDOOR_SYMBOL_MIN_ZOOM}
          filter={['has', 'icon']}
          style={{
            iconImage: ['get', 'icon'],
            iconSize: ICON_SIZE,
            iconAllowOverlap: false,
            textOptional: true,
            ...nameStyle(POI_TEXT_COLOR, {
              textAnchor: 'top',
              textOffset: [0, 1.1],
              textOptional: true,
            }),
          }}
        />
        <SymbolLayer
          id="base-pois-text"
          minZoomLevel={OUTDOOR_LABEL_MIN_ZOOM}
          filter={['!', ['has', 'icon']]}
          style={nameStyle(C.text)}
        />
      </ShapeSource>

      <ShapeSource id="base-landuse-names" shape={landNames}>
        <SymbolLayer
          id="base-landuse-names-text"
          minZoomLevel={OUTDOOR_LABEL_MIN_ZOOM - 1}
          style={nameStyle(C.landText, {
            textSize: ['interpolate', ['linear'], ['zoom'], 15, 12, 19, 17],
            textMaxWidth: 10,
            textLetterSpacing: 0.12,
          })}
        />
      </ShapeSource>
      <ShapeSource id="base-sports-names" shape={sportsNames}>
        <SymbolLayer
          id="base-sports-names-text"
          minZoomLevel={OUTDOOR_LABEL_MIN_ZOOM}
          style={nameStyle(C.areaText)}
        />
      </ShapeSource>
      <ShapeSource id="base-green-names" shape={greenNames}>
        <SymbolLayer
          id="base-green-names-text"
          minZoomLevel={OUTDOOR_LABEL_MIN_ZOOM}
          style={nameStyle(C.areaText)}
        />
      </ShapeSource>
      <ShapeSource id="base-building-names" shape={buildingNames}>
        <SymbolLayer
          id="base-building-names-text"
          minZoomLevel={OUTDOOR_LABEL_MIN_ZOOM}
          style={nameStyle(C.text)}
        />
      </ShapeSource>
    </>
  );
}
