// IndoorMapView — draws the indoor floor plan.
//
// When the walking screen's current step is indoor, this component
// replaces the outdoor tile map. It:
//   1. Fetches the rooms and corridors for the current building+level
//      from /api/indoor/areas (through the persistent cache).
//   2. Renders them on a blank MapLibre map: rooms white, corridors
//      light grey, room names as labels.
//   3. Draws the indoor route: solid on the current floor, faint
//      dashed on other floors.
//   4. Marks the destination with a red dot.
//   5. Shows a "you are here" dot on the current step's point, when
//      the displayed floor matches the current step's floor.
//   6. Shows a floor switcher on the right edge if the settings
//      toggle is on, or always when `forceSwitcher` is true.
//
// The camera auto-fits to the room bounds on first render.
//
// Changes in this version:
//   - The map is no longer unmounted while a new floor loads. The
//     loading spinner is shown as an overlay on top of the existing
//     map, so the Camera keeps its state.
//   - The fit runs once per (building, level) via a ref, so re-renders
//     and step advances don't override the student's zoom or pan.
//   - The fit formula uses the container's real pixel size and a
//     metres-per-pixel diagonal.
//   - Heading is computed differently for the two modes:
//       • Walking screen (lockHeading = false): the heading is the
//         direction of the road the student is about to walk,
//         rounded to a multiple of INDOOR_HEADING_SNAP_DEG (90, 45,
//         22.5, or 0 for the exact angle). Updates on a Next press,
//         not continuously.
//       • Preview (lockHeading = true): the heading is the start-to-
//         end bearing of the whole route, snapped to N or S only.
//         Unchanged from the previous version.
//   - `lockHeading` prop: used by the route preview. When true, the
//     heading is computed from the whole route, so tapping a floor
//     chip doesn't rotate the map.
//   - forceSwitcher prop: when true, the floor switcher is shown
//     regardless of the settings toggle.
//   - onNoRooms is called in the catch branch too, so a network error
//     on the floor-plan fetch falls back to the outdoor map.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  MapView,
  Camera,
  ShapeSource,
  FillLayer,
  LineLayer,
  SymbolLayer,
  CircleLayer,
} from '@maplibre/maplibre-react-native';

import { getIndoorAreas } from '@/services/api';
import { useSettings } from '@/context/SettingsContext';
import { bearingDeg, haversineM } from '@/utils/geo';
import { t } from '@/i18n';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';
import { polygonLabelInfo } from '@/utils/polygonLabel';
import { labelMinZoom } from '@/utils/labelFit';
import { headingAlongRoute } from '@/utils/legBearing';
import { headingLabel } from '@/utils/headingLabel';
import {
  INDOOR_BACKGROUND_COLOR,
  INDOOR_INTERIOR_COLOR,
  INDOOR_BUILDING_OUTLINE_COLOR,
  INDOOR_BUILDING_OUTLINE_WIDTH,
  INDOOR_STAIRS_COLOR,
  INDOOR_STAIRS_OUTLINE_COLOR,
  INDOOR_CORRIDOR_COLOR,
  INDOOR_CORRIDOR_OUTLINE_COLOR,
  INDOOR_ROOM_COLOR,
  INDOOR_ROOM_OUTLINE_COLOR,
  INDOOR_ROOM_OUTLINE_WIDTH,
  INDOOR_HEADING_SNAP_DEG,
  INDOOR_LABEL_MIN_SIZE,
  INDOOR_LABEL_MAX_SIZE,
  INDOOR_LABEL_FULL_SIZE_ZOOM,
  INDOOR_LABEL_WRAP_EM,
  INDOOR_LABEL_FIT,
  INDOOR_CURRENT_LEG_COLOR,
  INDOOR_CURRENT_LEG_OUTLINE_COLOR,
  INDOOR_CURRENT_LEG_WIDTH,
  INDOOR_CURRENT_LEG_OUTLINE_WIDTH,
  INDOOR_LEG_END_DOT_RADIUS,
  INDOOR_LEG_END_DOT_BORDER_WIDTH,
  INDOOR_ROUTE_FADED_OPACITY,
} from '@/constants/config';

const BLANK_STYLE = JSON.stringify({
  version: 8,
  name: 'indoor-blank',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': INDOOR_BACKGROUND_COLOR },
    },
  ],
});

const FILL_COLOR_EXPR = [
  'match',
  ['get', 'type'],
  'corridor', INDOOR_CORRIDOR_COLOR,
  'room', INDOOR_ROOM_COLOR,
  INDOOR_ROOM_COLOR,
];

// A bearing needs at least this much movement to be meaningful.
// Below it, GPS noise would dominate, so we fall back to 0.
const MIN_HEADING_DISTANCE_M = 3;

// Walking screen: the map turns so the corridor you are about to walk
// points up the screen, but only in steps of INDOOR_HEADING_SNAP_DEG, so a
// small bend in a corridor does not keep turning the map.
//   90   -> N, E, S, W only (the original behaviour)
//   45   -> also NE, SE, SW, NW (default)
//   22.5 -> 16 directions, for buildings that sit at odd angles
//   0    -> no snapping: the exact direction of the corridor
// Set it in constants/config.js.

function levelLabel(level) {
  if (level === '-1') return 'B';
  if (level === '0') return 'G';
  return level;
}

// Snap a bearing to the nearest axis when it is close to one.
//
// A corridor surveyed at 86° or 93° is, on the ground, a corridor running
// due east-west. Showing 86° tilts the whole floor plan for no reason. So a
// bearing within AXIS_SNAP_TOLERANCE_DEG of a multiple of 90 is shown as
// that multiple; a bearing further from an axis (a genuinely diagonal
// corridor) is shown exactly as it is, so a real wrong angle still shows.
const AXIS_SNAP_TOLERANCE_DEG = 15;

function snapToCardinal(bearing) {
  if (bearing == null || !Number.isFinite(bearing)) return 0;
  const h = ((bearing % 360) + 360) % 360;
  const nearest = (Math.round(h / 90) * 90) % 360;
  const diff = Math.abs(((h - nearest + 540) % 360) - 180);
  const off = Math.abs(180 - diff);
  return off <= AXIS_SNAP_TOLERANCE_DEG ? nearest : h;
}

// Snap a bearing to N or S only. Used by the preview.
function snapToNorthSouth(bearing) {
  if (bearing == null || !Number.isFinite(bearing)) return 0;
  const h = ((bearing % 360) + 360) % 360;
  return Math.cos((h * Math.PI) / 180) >= 0 ? 0 : 180;
}

// Which compass letter is at the top of the screen for a given
// heading.
function firstLegBearing(points) {
  /**
   * Given a list of { lat, lon }, return the bearing from the first
   * point to the first point at least MIN_HEADING_DISTANCE_M away.
   * Returns 0 if no such point exists.
   */
  if (!points || points.length < 2) return null;
  const from = points[0];
  for (let i = 1; i < points.length; i++) {
    const to = points[i];
    if (
      haversineM(from.lat, from.lon, to.lat, to.lon) >=
      MIN_HEADING_DISTANCE_M
    ) {
      return bearingDeg(from.lat, from.lon, to.lat, to.lon);
    }
  }
  return null;
}

// ---- Room names --------------------------------------------------------
// A name is shown only from the zoom at which it fits inside its room, so a
// long name never spills over the neighbouring rooms. Names are a little
// smaller when zoomed out. All of this is set in constants/config.js; the
// numbers after ?? are used if a setting is missing there.
const LABEL_MIN_SIZE = INDOOR_LABEL_MIN_SIZE ?? 8;
const LABEL_MAX_SIZE = INDOOR_LABEL_MAX_SIZE ?? 11;
const LABEL_FULL_SIZE_ZOOM = INDOOR_LABEL_FULL_SIZE_ZOOM ?? 19;
const LABEL_WRAP_EM = INDOOR_LABEL_WRAP_EM ?? 7;
const LABEL_FIT = INDOOR_LABEL_FIT ?? 1.3;
const LABEL_START_ZOOM = 16; // at or below this zoom, names use the minimum size
const LABEL_BAND_STEP = 0.5; // names appear in half-zoom steps
const LABEL_FROM_ZOOM = 15; // below this zoom no names are shown
const LABEL_TO_ZOOM = 22;
const LABEL_BANDS = [];
for (let z = LABEL_FROM_ZOOM; z <= LABEL_TO_ZOOM; z += LABEL_BAND_STEP) {
  LABEL_BANDS.push(z);
}

export function IndoorMapView({
  buildingName,
  level,
  routeByLevel = [],
  destination = null,
  currentStepPoint = null,
  nextStepPoint = null,
  currentStepLevel = null,
  style,
  onNoRooms,
  forceSwitcher = false,
  lockHeading = false,
}) {
  const { settings } = useSettings();
  const cameraRef = useRef(null);

  const [selectedLevel, setSelectedLevel] = useState(level);

  const [areas, setAreas] = useState(null);
  const [availableLevels, setAvailableLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Container size, measured from onLayout, used for the fit maths.
  const [containerSize, setContainerSize] = useState({ width: 360, height: 480 });

  // Tracks which (building, level) the camera has already been fitted
  // to. Once a floor has been fitted, we never re-fit it, so the
  // student's zoom and pan are preserved across re-renders and step
  // advances.
  const fittedKeyRef = useRef(null);

  // The zoom the student chose by pinching. Null until they zoom. While it
  // is set, floor changes and Next presses keep this zoom instead of
  // snapping back to the default fit.
  const userZoomRef = useRef(null);
  // The zoom currently in use in this building (the fit zoom, or the zoom
  // the student pinched to). A new floor reuses it instead of re-fitting,
  // so the zoom stays the same when you change floor.
  const keptZoomRef = useRef(null);
  const restoringZoomRef = useRef(false);
  // Last heading we could compute, reused when no direction is available
  // (e.g. on the final step), so the map doesn't swing back to north.
  const lastHeadingRef = useRef(0);

  // 180-degree flip. Off by default: the map is route-up (the walking
  // direction is at the top of the screen). The corner button toggles
  // this, which turns the map exactly half a turn.
  const [flipped, setFlipped] = useState(false);

  // When the building changes, reset the selected level to whatever
  // the current step says, clear the fitted key so the new building's
  // floors get fitted, and reset the flip.
  useEffect(() => {
    setSelectedLevel(level);
    fittedKeyRef.current = null;
    userZoomRef.current = null;
    keptZoomRef.current = null;
    setFlipped(false);
  }, [buildingName]);

  // Follow the current step's level unless the student manually
  // switched.
  const [manuallyChosen, setManuallyChosen] = useState(false);
  useEffect(() => {
    if (!manuallyChosen) {
      setSelectedLevel(level);
    }
  }, [level, manuallyChosen]);
  useEffect(() => {
    setManuallyChosen(false);
  }, [buildingName]);

  // Fetch rooms and corridors for the selected level.
  useEffect(() => {
    let cancelled = false;

    if (!buildingName || selectedLevel == null) {
      setAreas([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);

    getIndoorAreas({ buildingName, level: selectedLevel })
      .then((data) => {
        if (cancelled) return;
        const list = data?.areas || [];
        setAreas(list);
        setAvailableLevels(data?.levels || []);
        if (list.filter((a) => a.type !== 'level').length === 0 && onNoRooms) onNoRooms();
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Could not load floor plan.');
        setAreas([]);
        if (onNoRooms) onNoRooms();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingName, selectedLevel]);

  // -------------------------------------------------------------------------
  // GeoJSON assembly
  // -------------------------------------------------------------------------

  const roomsGeoJSON = useMemo(() => {
    if (!areas || areas.length === 0) return null;
    const features = [];
    for (const area of areas) {
      if (area.type !== 'room') continue;
      const ring = _closedRing(area.boundary);
      if (!ring) continue;
      features.push(_polygonFeature(area, ring));
    }
    return { type: 'FeatureCollection', features };
  }, [areas]);

  // One point per room, at the room's visual centre, carrying its name and
  // the zoom from which that name fits inside the room (minZoom). Labels come
  // from these points instead of from the room polygons, so every name sits
  // in the middle of its room (see utils/polygonLabel.js and utils/labelFit.js).
  const roomLabelsGeoJSON = useMemo(() => {
    if (!areas || areas.length === 0) return null;
    const features = [];
    for (const area of areas) {
      if (area.type !== 'room') continue;
      const ring = _closedRing(area.boundary);
      if (!ring) continue;
      const info = polygonLabelInfo(ring);
      if (!info) continue;
      const minZoom = labelMinZoom(area.name, info.radiusM, {
        latDeg: info.point[1],
        minSize: LABEL_MIN_SIZE,
        maxSize: LABEL_MAX_SIZE,
        fullSizeZoom: LABEL_FULL_SIZE_ZOOM,
        startZoom: LABEL_START_ZOOM,
        wrapEm: LABEL_WRAP_EM,
        fit: LABEL_FIT,
        bandStep: LABEL_BAND_STEP,
        fromZoom: LABEL_FROM_ZOOM,
        toZoom: LABEL_TO_ZOOM,
      });
      if (minZoom === null) continue; // too small to ever hold its name
      features.push({
        type: 'Feature',
        properties: { name: area.name || '', minZoom },
        geometry: { type: 'Point', coordinates: info.point },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [areas]);

  const corridorsGeoJSON = useMemo(() => {
    if (!areas || areas.length === 0) return null;
    const features = [];
    for (const area of areas) {
      if (area.type !== 'corridor') continue;
      const ring = _closedRing(area.boundary);
      if (!ring) continue;
      features.push(_polygonFeature(area, ring));
    }
    return { type: 'FeatureCollection', features };
  }, [areas]);

  // Stairs: polygons tagged indoor=stairs. Drawn in their own colour.
  const stairsGeoJSON = useMemo(() => {
    if (!areas || areas.length === 0) return null;
    const features = [];
    for (const area of areas) {
      if (area.type !== 'stairs') continue;
      const ring = _closedRing(area.boundary);
      if (!ring) continue;
      features.push(_polygonFeature(area, ring));
    }
    return { type: 'FeatureCollection', features };
  }, [areas]);

  // Floor outline: polygons tagged indoor=level (one closed way around the
  // building on each floor). Filled with the interior colour and outlined.
  const footprintGeoJSON = useMemo(() => {
    if (!areas) return null;
    const features = [];
    for (const area of areas) {
      if (area.type !== 'level') continue;
      const ring = _closedRing(area.boundary);
      if (!ring) continue;
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    }
    return features.length > 0
      ? { type: 'FeatureCollection', features }
      : null;
  }, [areas]);

  const { routeSolidGeoJSON, routeDashedGeoJSON } = useMemo(() => {
    if (!routeByLevel || routeByLevel.length === 0) {
      return { routeSolidGeoJSON: null, routeDashedGeoJSON: null };
    }
    if (routeByLevel.length === 1) {
      return { routeSolidGeoJSON: null, routeDashedGeoJSON: null };
    }

    const segments = [];
    let current = null;

    for (const pt of routeByLevel) {
      const matches = pt.level === selectedLevel;
      if (!current || current.matches !== matches) {
        if (current && current.points.length >= 2) segments.push(current);
        current = { matches, points: [[pt.lon, pt.lat]] };
      } else {
        current.points.push([pt.lon, pt.lat]);
      }
    }
    if (current && current.points.length >= 2) segments.push(current);

    const solid = [];
    const dashed = [];
    for (const seg of segments) {
      const feature = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: seg.points },
      };
      if (seg.matches) solid.push(feature);
      else dashed.push(feature);
    }

    return {
      routeSolidGeoJSON:
        solid.length > 0 ? { type: 'FeatureCollection', features: solid } : null,
      routeDashedGeoJSON:
        dashed.length > 0 ? { type: 'FeatureCollection', features: dashed } : null,
    };
  }, [routeByLevel, selectedLevel]);

  // The part of the route the student must walk during the current step:
  // from the current step's point to the next step's point, on this floor only.
  const currentLegGeoJSON = useMemo(() => {
    if (!currentStepPoint || !nextStepPoint || !routeByLevel?.length) return null;
    const same = (p, q) => p.lat === q.lat && p.lon === q.lon;

    const startIdx = routeByLevel.findIndex((p) => same(p, currentStepPoint));
    if (startIdx < 0) return null;
    let endIdx = -1;
    for (let i = startIdx + 1; i < routeByLevel.length; i++) {
      if (same(routeByLevel[i], nextStepPoint)) { endIdx = i; break; }
    }
    if (endIdx < 0) return null;

    const runs = [];
    let cur = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const p = routeByLevel[i];
      if (p.level === selectedLevel) {
        cur.push([p.lon, p.lat]);
      } else {
        if (cur.length >= 2) runs.push(cur);
        cur = [];
      }
    }
    if (cur.length >= 2) runs.push(cur);
    if (runs.length === 0) return null;

    return {
      type: 'FeatureCollection',
      features: runs.map((coordinates) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      })),
    };
  }, [routeByLevel, currentStepPoint, nextStepPoint, selectedLevel]);

  // -------------------------------------------------------------------------
  // Route-up heading
  // -------------------------------------------------------------------------
  //
  // Two distinct behaviours, selected by `lockHeading`.
  //
  // Walking screen (lockHeading = false):
  //   The heading is the direction of the road the student is about to
  //   walk (see utils/legBearing.js), taken from `currentStepPoint`
  //   forward, rounded to the nearest multiple of INDOOR_HEADING_SNAP_DEG
  //   (90 = N/E/S/W, 45 = 8 directions, 22.5 = 16, 0 = exact angle,
  //   no rounding). The heading updates
  //   when `currentStepPoint` changes — i.e. when the student presses
  //   Next. Between presses, the map holds still.
  //
  // Preview (lockHeading = true):
  //   The heading is the start-to-end bearing of the whole route,
  //   SNAPPED to N or S only. Tapping a floor chip does not rotate
  //   the preview. This matches the previous version's behaviour.
  const routeHeadingRaw = useMemo(() => {
    const all = routeByLevel || [];
    if (all.length < 2) return 0;

    if (lockHeading) {
      // Preview: overall direction of the trip, snapped to N or S.
      const first = all[0];
      const last = all[all.length - 1];
      let raw;
      if (
        haversineM(first.lat, first.lon, last.lat, last.lon) >=
        MIN_HEADING_DISTANCE_M
      ) {
        raw = bearingDeg(first.lat, first.lon, last.lat, last.lon);
      } else {
        raw = firstLegBearing(all);
      }
      return snapToNorthSouth(raw ?? 0);
    }

    // Walking: look at the points on the current floor from
    // `currentStepPoint` forward, take the first real leg's bearing,
    // then snap to the nearest cardinal.
    let points = all.filter((p) => p.level === selectedLevel);
    if (points.length < 2) {
      points = all;
    }

    let startIdx = 0;
    if (currentStepPoint) {
      const idx = points.findIndex(
        (p) =>
          p.lat === currentStepPoint.lat && p.lon === currentStepPoint.lon
      );
      if (idx >= 0) startIdx = idx;
    }

    const slice = points.slice(startIdx);

    // The very first step starts in a room. There the path begins with a
    // short stub into the corridor, which must not decide the direction.
    const isRouteStart = startIdx === 0;

    // The direction of the road ahead (see utils/legBearing.js): along the
    // corridor at the start, along the path until it turns on the way, and
    // towards the destination door on the last turn.
    const raw = headingAlongRoute(slice, { isRouteStart });
    // No usable direction (last step, or the leg is under 3 m): keep the
    // previous heading instead of swinging to north.
    console.log('HEADING', { isRouteStart, startIdx, n: slice.length, first4: slice.slice(0, 4), raw });
    return raw == null ? null : snapToCardinal(raw);
  }, [routeByLevel, selectedLevel, currentStepPoint, lockHeading]);

  if (routeHeadingRaw != null) lastHeadingRef.current = routeHeadingRaw;
  const routeHeading = routeHeadingRaw ?? lastHeadingRef.current;

  // The heading actually applied to the camera: the route-up heading,
  // plus a half turn when the student has pressed the flip button.
  const effectiveHeading = (routeHeading + (flipped ? 180 : 0)) % 360;

  // -------------------------------------------------------------------------
  // Camera fit — once per (building, level)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!cameraRef.current) return;
    if (loading) return;
    if (!areas || areas.length === 0) return;

    const key = `${buildingName}|${selectedLevel}`;
    if (fittedKeyRef.current === key) return;

    const points = [];
    for (const area of areas) {
      for (const p of area.boundary || []) {
        points.push([p.lon, p.lat]);
      }
    }
    if (points.length === 0) return;

    const lons = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    const west = Math.min(...lons);
    const east = Math.max(...lons);
    const south = Math.min(...lats);
    const north = Math.max(...lats);

    const centerLon = (west + east) / 2;
    const centerLat = (south + north) / 2;

    // Diagonal in metres at the building's latitude.
    const refLat = centerLat;
    const cosLat = Math.cos((refLat * Math.PI) / 180);
    const widthM = Math.abs(east - west) * 111320 * cosLat;
    const heightM = Math.abs(north - south) * 110540;
    const diagM = Math.hypot(widthM, heightM);

    // Metres per pixel, using the smaller container dimension and a
    // 0.9 factor so the building doesn't touch the edges.
    const minDim = Math.min(containerSize.width, containerSize.height);
    const mPerPx = diagM / Math.max(minDim * 0.9, 1);

    // Web Mercator: metres-per-pixel at zoom z is
    //   (78271.5 * cosLat) / 2^z.
    const zoom = Math.log2((78271.5 * cosLat) / mPerPx);

    const fitZoom = Math.max(16, Math.min(21, zoom));
    // If the student has zoomed in, keep their zoom on the new floor and
    // centre on where they are, rather than on the whole building.
    const keepUserZoom = userZoomRef.current != null;
    const clamped = keptZoomRef.current != null ? keptZoomRef.current : fitZoom;
    const stepHere =
      keepUserZoom && currentStepPoint && currentStepLevel === selectedLevel;
    const camCenter = stepHere
      ? [currentStepPoint.lon, currentStepPoint.lat]
      : [centerLon, centerLat];

    const timeout = setTimeout(() => {
      // Mark as fitted only once we actually issue the camera call.
      fittedKeyRef.current = key;
      keptZoomRef.current = clamped;
      try {
        cameraRef.current?.setCamera({
          centerCoordinate: camCenter,
          zoomLevel: clamped,
          heading: effectiveHeading,
          animationDuration: 400,
        });
      } catch {
        // Silent.
      }
    }, 100);

    return () => clearTimeout(timeout);
    // effectiveHeading intentionally excluded: the fit is a one-shot
    // per floor; heading changes are handled by the separate effect
    // below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, loading, buildingName, selectedLevel, containerSize]);

  // -------------------------------------------------------------------------
  // Heading effect — turns the map when the route direction changes
  // -------------------------------------------------------------------------
  //
  // Runs whenever `effectiveHeading` changes. That happens on a Next
  // press in walking mode (currentStepPoint moves → routeHeading
  // recomputes → snapped heading may change), and on a flip button
  // press. It only sets the heading, leaving centre and zoom alone.
  //
  // It also runs on every Next press. If the student has zoomed, their zoom
  // is sent in the same camera call as the heading, so a turn can never
  // bring back the default zoom.
  useEffect(() => {
    if (!cameraRef.current) return;
    const cam = { heading: effectiveHeading, animationDuration: 500 };
    if (userZoomRef.current != null) cam.zoomLevel = userZoomRef.current;
    try {
      cameraRef.current.setCamera(cam);
    } catch {
      // Silent.
    }
  }, [effectiveHeading, currentStepPoint?.lat, currentStepPoint?.lon]);

  // Remember pinch-zooms. If the zoom changes by itself (not the student)
  // while they have a zoom set, put it back.
  const handleRegionDidChange = (feature) => {
    const props = feature?.properties;
    if (!props || typeof props.zoomLevel !== 'number') return;
    if (props.isUserInteraction) {
      userZoomRef.current = props.zoomLevel;
      keptZoomRef.current = props.zoomLevel;
      return;
    }
    const wanted = userZoomRef.current;
    if (
      wanted != null &&
      !restoringZoomRef.current &&
      Math.abs(props.zoomLevel - wanted) > 0.25
    ) {
      restoringZoomRef.current = true;
      try {
        cameraRef.current?.setCamera({
          zoomLevel: wanted,
          animationDuration: 250,
        });
      } catch {
        // Silent.
      }
      setTimeout(() => {
        restoringZoomRef.current = false;
      }, 400);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // First load only: nothing to show yet, so the spinner is fine and
  // there's no camera state to preserve.
  if (loading && !areas) {
    return (
      <View
        style={[styles.container, style]}
        onLayout={(e) => setContainerSize(e.nativeEvent.layout)}
      >
        <ActivityIndicator color={COLORS.primaryDark} />
      </View>
    );
  }

  if (error && (!areas || areas.length === 0)) {
    return <View style={[styles.container, style]} />;
  }

  if (!areas || areas.length === 0) {
    return <View style={[styles.container, style]} />;
  }

  const firstCentroid =
    areas[0]?.centroid || areas[0]?.boundary?.[0] || null;
  const initialCenter = firstCentroid
    ? [firstCentroid.lon, firstCentroid.lat]
    : [0, 0];

  const showYouAreHere =
    currentStepPoint && currentStepLevel === selectedLevel;

  const showSwitcher =
    (forceSwitcher || settings.showFloorSwitcher !== false) &&
    availableLevels.length > 1;

  return (
    <View
      style={[styles.container, style]}
      onLayout={(e) => setContainerSize(e.nativeEvent.layout)}
    >
      <MapView
        style={styles.map}
        mapStyle={BLANK_STYLE}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        rotateEnabled={false}
        onRegionDidChange={handleRegionDidChange}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: initialCenter,
            zoomLevel: 18,
            heading: effectiveHeading,
          }}
        />

        {footprintGeoJSON ? (
          <ShapeSource id="footprintSource" shape={footprintGeoJSON}>
            <FillLayer
              id="footprintFill"
              style={{ fillColor: INDOOR_INTERIOR_COLOR, fillOpacity: 1 }}
            />
            <LineLayer
              id="footprintOutline"
              style={{
                lineColor: INDOOR_BUILDING_OUTLINE_COLOR,
                lineWidth: INDOOR_BUILDING_OUTLINE_WIDTH,
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        ) : null}

        {corridorsGeoJSON && corridorsGeoJSON.features.length > 0 ? (
          <ShapeSource id="corridorsSource" shape={corridorsGeoJSON}>
            <FillLayer
              id="corridorsFill"
              style={{ fillColor: FILL_COLOR_EXPR, fillOpacity: 1 }}
            />
            <LineLayer
              id="corridorsOutline"
              style={{
                lineColor: INDOOR_CORRIDOR_OUTLINE_COLOR,
                lineWidth: 0.75,
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        ) : null}

        {stairsGeoJSON && stairsGeoJSON.features.length > 0 ? (
          <ShapeSource id="stairsSource" shape={stairsGeoJSON}>
            <FillLayer
              id="stairsFill"
              style={{ fillColor: INDOOR_STAIRS_COLOR, fillOpacity: 1 }}
            />
            <LineLayer
              id="stairsOutline"
              style={{
                lineColor: INDOOR_STAIRS_OUTLINE_COLOR,
                lineWidth: 1.25,
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        ) : null}

        {roomsGeoJSON && roomsGeoJSON.features.length > 0 ? (
          <ShapeSource id="roomsSource" shape={roomsGeoJSON}>
            <FillLayer
              id="roomsFill"
              style={{ fillColor: FILL_COLOR_EXPR, fillOpacity: 1 }}
            />
            <LineLayer
              id="roomsOutline"
              style={{
                lineColor: INDOOR_ROOM_OUTLINE_COLOR,
                lineWidth: INDOOR_ROOM_OUTLINE_WIDTH,
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        ) : null}

        {roomLabelsGeoJSON && roomLabelsGeoJSON.features.length > 0 ? (
          <ShapeSource id="roomLabelsSource" shape={roomLabelsGeoJSON}>
            {/* One layer per half-zoom step. Each shows only the names that
                already fit at that zoom, so a hidden name never blocks a
                visible one and no name is wider than its room. */}
            {LABEL_BANDS.map((band, index) => (
              <SymbolLayer
                key={`roomsLabels-${band}`}
                id={`roomsLabels-${band}`}
                minZoomLevel={band}
                maxZoomLevel={
                  index === LABEL_BANDS.length - 1 ? 24 : band + LABEL_BAND_STEP
                }
                filter={['<=', ['get', 'minZoom'], band]}
                style={{
                  textField: ['get', 'name'],
                  textFont: ['Noto Sans Regular'],
                  textSize: [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    LABEL_START_ZOOM,
                    LABEL_MIN_SIZE,
                    LABEL_FULL_SIZE_ZOOM,
                    LABEL_MAX_SIZE,
                  ],
                  textMaxWidth: LABEL_WRAP_EM,
                  textColor: '#334155',
                  textHaloColor: '#ffffff',
                  textHaloWidth: 1.5,
                  textAllowOverlap: false,
                  textIgnorePlacement: false,
                  // Centred on the point and always upright, whichever way
                  // the map is turned.
                  textAnchor: 'center',
                  textJustify: 'center',
                  textRotate: 0,
                  textRotationAlignment: 'viewport',
                  textPitchAlignment: 'viewport',
                }}
              />
            ))}
          </ShapeSource>
        ) : null}

        {routeDashedGeoJSON ? (
          <ShapeSource id="indoorRouteDashedSource" shape={routeDashedGeoJSON}>
            <LineLayer
              id="indoorRouteDashedLine"
              style={{
                lineColor: '#2563eb',
                lineWidth: 3,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 0.4,
                lineDasharray: [4, 4],
              }}
            />
          </ShapeSource>
        ) : null}

        {routeSolidGeoJSON ? (
          <ShapeSource id="indoorRouteSolidSource" shape={routeSolidGeoJSON}>
            <LineLayer
              id="indoorRouteSolidLine"
              style={{
                lineColor: '#2563eb',
                lineWidth: 4,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: currentLegGeoJSON ? INDOOR_ROUTE_FADED_OPACITY : 1,
              }}
            />
          </ShapeSource>
        ) : null}

        {currentLegGeoJSON ? (
          <ShapeSource id="indoorCurrentLegSource" shape={currentLegGeoJSON}>
            <LineLayer
              id="indoorCurrentLegCasing"
              style={{
                lineColor: INDOOR_CURRENT_LEG_OUTLINE_COLOR,
                lineWidth: INDOOR_CURRENT_LEG_OUTLINE_WIDTH,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            <LineLayer
              id="indoorCurrentLegLine"
              style={{
                lineColor: INDOOR_CURRENT_LEG_COLOR,
                lineWidth: INDOOR_CURRENT_LEG_WIDTH,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        ) : null}

        {currentLegGeoJSON && nextStepPoint ? (
          <ShapeSource id="indoorNextStepSource" shape={pointFeature(nextStepPoint)}>
            <CircleLayer
              id="indoorNextStepDot"
              style={{
                circleRadius: INDOOR_LEG_END_DOT_RADIUS,
                circleColor: '#ffffff',
                circleStrokeColor: INDOOR_CURRENT_LEG_OUTLINE_COLOR,
                circleStrokeWidth: INDOOR_LEG_END_DOT_BORDER_WIDTH,
              }}
            />
          </ShapeSource>
        ) : null}

        {destination ? (
          <ShapeSource id="indoorDestSource" shape={pointFeature(destination)}>
            <CircleLayer
              id="indoorDestHalo"
              style={{ circleRadius: 11, circleColor: '#dc2626', circleOpacity: 0.25 }}
            />
            <CircleLayer
              id="indoorDestDot"
              style={{
                circleRadius: 6,
                circleColor: '#dc2626',
                circleStrokeColor: '#ffffff',
                circleStrokeWidth: 2,
              }}
            />
          </ShapeSource>
        ) : null}

        {showYouAreHere ? (
          <ShapeSource id="indoorUserSource" shape={pointFeature(currentStepPoint)}>
            <CircleLayer
              id="indoorUserHalo"
              style={{ circleRadius: 14, circleColor: '#2563eb', circleOpacity: 0.25 }}
            />
            <CircleLayer
              id="indoorUserDot"
              style={{
                circleRadius: 8,
                circleColor: '#2563eb',
                circleStrokeColor: '#ffffff',
                circleStrokeWidth: 3,
              }}
            />
          </ShapeSource>
        ) : null}
      </MapView>

      {/* Spinner overlay for floor changes after the first load. */}
      {loading && areas && areas.length > 0 ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={COLORS.primaryDark} />
        </View>
      ) : null}

      {/* Flip button, top-right corner. Shows the compass letter that is
          at the top of the screen right now. Each press turns the map
          exactly 180 degrees. */}
      <TouchableOpacity
        style={styles.northButton}
        onPress={() => setFlipped((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`Map top is ${headingLabel(effectiveHeading, INDOOR_HEADING_SNAP_DEG)}. Turn the map around`}
      >
        <Text
          style={styles.northButtonText}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {headingLabel(effectiveHeading, INDOOR_HEADING_SNAP_DEG)}
        </Text>
      </TouchableOpacity>

      {showSwitcher ? (
        <View style={styles.switcherContainer}>
          {availableLevels.map((lvl) => {
            const active = lvl === selectedLevel;
            const isStepLevel = lvl === currentStepLevel;
            return (
              <TouchableOpacity
                key={lvl}
                style={[
                  styles.switcherChip,
                  active && styles.switcherChipActive,
                ]}
                onPress={() => {
                  setSelectedLevel(lvl);
                  setManuallyChosen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Floor ${levelLabel(lvl)}`}
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.switcherChipText,
                    active && styles.switcherChipTextActive,
                  ]}
                >
                  {levelLabel(lvl)}
                </Text>
                {isStepLevel && !active ? (
                  <View style={styles.stepLevelDot} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function pointFeature(p) {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
  };
}

function _closedRing(boundary) {
  if (!boundary || boundary.length === 0) return null;
  const ring = boundary.map((p) => [p.lon, p.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

function _polygonFeature(area, ring) {
  return {
    type: 'Feature',
    properties: {
      id: area.id,
      name: area.name || '',
      ref: area.ref || '',
      type: area.type,
      level: area.level,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: INDOOR_BACKGROUND_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: {
    flex: 1,
    width: '100%',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(241, 245, 249, 0.35)',
  },
  northButton: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  northButtonText: {
    // 16 fits "N" or "NE"; longer labels ("NNE", "137°") shrink to fit.
    fontSize: 15,
    paddingHorizontal: 2,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  destMarkerOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(220, 38, 38, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destMarkerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#dc2626',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  userDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  switcherContainer: {
    position: 'absolute',
    right: SPACING.md,
    top: '40%',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.xs,
    paddingHorizontal: 4,
  },
  switcherChip: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  switcherChipActive: {
    backgroundColor: COLORS.primaryDark,
  },
  switcherChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  switcherChipTextActive: {
    color: '#ffffff',
  },
  stepLevelDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
});