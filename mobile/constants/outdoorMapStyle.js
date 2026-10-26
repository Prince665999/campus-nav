// How the outdoor map looks when it is drawn from your own map.osm.
// Change a colour here and reload the app.
//
// Used by components/OutdoorBaseMap.jsx and components/MapView.jsx.

export const OUTDOOR_COLORS = {
  land: '#f8f4f0', // the ground: milk white (outside any area)
  buildingFill: '#d9d0c9',
  buildingLine: '#c6b9ab',
  road: '#ffffff',
  roadPedestrian: '#ededed',
  roadCasing: '#bbbbbb', // the grey edge of a road
  track: '#996703', // dirt tracks (dashed)
  path: '#ffffff', // footpaths: white dots, so they stand out from the milk ground
  parkingFill: '#eeeeee',
  parkingLine: '#cfc8bd',
  water: '#aad3df',
  treeFill: '#add19e',
  treeLine: '#8cb87d',
  halo: '#ffffff', // outline around text so it reads on any colour

  // Names
  text: '#444444', // building names
  areaText: '#3b7a5a', // pitches, parks, sports grounds
  landText: '#6b6b52', // the campus itself
  brownText: '#734a08', // library, food, banks...
  redText: '#bf0000', // clinics and the dispensary
  blueText: '#0066aa', // parking, buses
  purpleText: '#ac39ac', // shops
};

// Land that is not green. "education" is the campus itself: the same milk white
// as the ground, so paths and buildings stand out from it.
export const LANDUSE_COLORS = {
  education: '#f8f4f0',
  university: '#f8f4f0',
  college: '#f8f4f0',
  school: '#f8f4f0',
  kindergarten: '#f8f4f0',
  hospital: '#f8f4f0',
  clinic: '#f8f4f0',
  residential: '#e0dfdf',
  commercial: '#f2dad9',
  retail: '#ffd6d1',
  industrial: '#ebdbe8',
  military: '#f3e6e6',
  religious: '#cdebb0',
  construction: '#c7c7b4',
  brownfield: '#b9a979',
  default: '#ecebdf',
};

// Green ground.
export const GREEN_COLORS = {
  grass: '#cdebb0',
  meadow: '#cdebb0',
  greenfield: '#cdebb0',
  village_green: '#cdebb0',
  garden: '#cdebb0',
  park: '#c8facc',
  recreation_ground: '#dffce2',
  forest: '#add19e',
  wood: '#add19e',
  scrub: '#c8d7ab',
  grassland: '#cdebb0',
  heath: '#d6d99f',
  wetland: '#d2e0c9',
  farmland: '#eef0d5',
  orchard: '#aedfa3',
  vineyard: '#aedfa3',
  allotments: '#c9e1bf',
  nature_reserve: '#cdebb0',
  cemetery: '#aacbaf',
  default: '#cdebb0',
};

// Pitches, courts, stadiums, pools.
export const SPORTS_FILL = {
  pitch: '#88e0be',
  sports_centre: '#dffce2',
  stadium: '#dffce2',
  track: '#74dcba',
  swimming_pool: '#aad3df',
  playground: '#ccffff',
  golf_course: '#b5e3b5',
  miniature_golf: '#b5e3b5',
  default: '#88e0be',
};
export const SPORTS_LINE = {
  pitch: '#5fb99a',
  sports_centre: '#9ad6ae',
  stadium: '#9ad6ae',
  track: '#5fb99a',
  swimming_pool: '#7fb7c6',
  playground: '#8fd1d1',
  default: '#5fb99a',
};

// Name colour by symbol, as on openstreetmap.org.
export const POI_TEXT_COLORS = {
  medical: OUTDOOR_COLORS.redText,
  parking: OUTDOOR_COLORS.blueText,
  bus: OUTDOOR_COLORS.blueText,
  toilets: OUTDOOR_COLORS.blueText,
  lodging: OUTDOOR_COLORS.blueText,
  info: OUTDOOR_COLORS.blueText,
  fuel: OUTDOOR_COLORS.blueText,
  police: OUTDOOR_COLORS.blueText,
  shop: OUTDOOR_COLORS.purpleText,
  default: OUTDOOR_COLORS.brownText,
};

/** A MapLibre expression that picks a colour by the feature's "kind". */
export function kindColor(table, property = 'kind') {
  const { default: fallback, ...rest } = table;
  const pairs = Object.entries(rest).flat();
  return ['match', ['get', property], ...pairs, fallback];
}

// Names show from this zoom. Lower = names appear sooner (more clutter).
export const OUTDOOR_LABEL_MIN_ZOOM = 16;
// Symbols (parking, dispensary...) show from this zoom.
export const OUTDOOR_SYMBOL_MIN_ZOOM = 15.5;
// Trees show from this zoom.
export const OUTDOOR_TREE_MIN_ZOOM = 17;

// A blank map: just the ground colour. Everything else is drawn on top from
// your data. The text fonts still come from the same free font server the
// indoor map uses (fonts only, no map pictures).
export const OUTDOOR_BLANK_STYLE = JSON.stringify({
  version: 8,
  name: 'outdoor-blank',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': OUTDOOR_COLORS.land },
    },
  ],
});