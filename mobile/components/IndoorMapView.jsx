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
//         compass direction of the leg the student is about to walk,
//         SNAPPED to one of N / E / S / W. Only four values, so the
//         building outline never sits at a skew angle. Updates on a
//         Next press, not continuously.
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
  MarkerView,
} from '@maplibre/maplibre-react-native';

import { getIndoorAreas } from '@/services/api';
import { useSettings } from '@/context/SettingsContext';
import { bearingDeg, haversineM } from '@/utils/geo';
import { t } from '@/i18n';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';

const BLANK_STYLE = JSON.stringify({
  version: 8,
  name: 'indoor-blank',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#f1f5f9' },
    },
  ],
});

const FILL_COLOR_EXPR = [
  'match',
  ['get', 'type'],
  'corridor', '#e2e8f0',
  'room', '#ffffff',
  '#ffffff',
];

// A bearing needs at least this much movement to be meaningful.
// Below it, GPS noise would dominate, so we fall back to 0.
const MIN_HEADING_DISTANCE_M = 3;

// Walking screen: the only four headings the map will use. No
// intermediate angles — the building stays square to the screen.
const CARDINALS = [0, 90, 180, 270];

function levelLabel(level) {
  if (level === '-1') return 'B';
  if (level === '0') return 'G';
  return level;
}

// Snap a bearing to the nearest of N / E / S / W.
function snapToCardinal(bearing) {
  if (bearing == null || !Number.isFinite(bearing)) return 0;
  const h = ((bearing % 360) + 360) % 360;
  let best = 0;
  let bestDiff = Infinity;
  for (const c of CARDINALS) {
    const diff = Math.abs(((h - c + 540) % 360) - 180);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}

// Snap a bearing to N or S only. Used by the preview.
function snapToNorthSouth(bearing) {
  if (bearing == null || !Number.isFinite(bearing)) return 0;
  const h = ((bearing % 360) + 360) % 360;
  return Math.cos((h * Math.PI) / 180) >= 0 ? 0 : 180;
}

// Which compass letter is at the top of the screen for a given
// heading.
function topLetter(heading) {
  const h = ((heading % 360) + 360) % 360;
  if (h >= 315 || h < 45) return 'N';
  if (h < 135) return 'E';
  if (h < 225) return 'S';
  return 'W';
}

function firstLegBearing(points) {
  /**
   * Given a list of { lat, lon }, return the bearing from the first
   * point to the first point at least MIN_HEADING_DISTANCE_M away.
   * Returns 0 if no such point exists.
   */
  if (!points || points.length < 2) return 0;
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
  return 0;
}

export function IndoorMapView({
  buildingName,
  level,
  routeByLevel = [],
  destination = null,
  currentStepPoint = null,
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
        if (list.length === 0 && onNoRooms) onNoRooms();
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

  // -------------------------------------------------------------------------
  // Route-up heading
  // -------------------------------------------------------------------------
  //
  // Two distinct behaviours, selected by `lockHeading`.
  //
  // Walking screen (lockHeading = false):
  //   The heading is the compass direction of the leg the student is
  //   about to walk, taken from `currentStepPoint` forward, SNAPPED
  //   to the nearest of N / E / S / W. Only four values are ever
  //   applied, so the building outline never sits at a skew angle and
  //   the map only rotates on the four 90° axes. The heading updates
  //   when `currentStepPoint` changes — i.e. when the student presses
  //   Next. Between presses, the map holds still.
  //
  // Preview (lockHeading = true):
  //   The heading is the start-to-end bearing of the whole route,
  //   SNAPPED to N or S only. Tapping a floor chip does not rotate
  //   the preview. This matches the previous version's behaviour.
  const routeHeading = useMemo(() => {
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
      return snapToNorthSouth(raw);
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
    const raw = firstLegBearing(slice);
    return snapToCardinal(raw);
  }, [routeByLevel, selectedLevel, currentStepPoint, lockHeading]);

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

    const clamped = Math.max(16, Math.min(21, zoom));

    const timeout = setTimeout(() => {
      // Mark as fitted only once we actually issue the camera call.
      fittedKeyRef.current = key;
      try {
        cameraRef.current?.setCamera({
          centerCoordinate: [centerLon, centerLat],
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
  useEffect(() => {
    if (!cameraRef.current) return;
    try {
      cameraRef.current.setCamera({
        heading: effectiveHeading,
        animationDuration: 500,
      });
    } catch {
      // Silent.
    }
  }, [effectiveHeading]);

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
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: initialCenter,
            zoomLevel: 18,
            heading: effectiveHeading,
          }}
        />

        {corridorsGeoJSON && corridorsGeoJSON.features.length > 0 ? (
          <ShapeSource id="corridorsSource" shape={corridorsGeoJSON}>
            <FillLayer
              id="corridorsFill"
              style={{ fillColor: FILL_COLOR_EXPR, fillOpacity: 1 }}
            />
            <LineLayer
              id="corridorsOutline"
              style={{ lineColor: '#cbd5e1', lineWidth: 0.5 }}
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
              style={{ lineColor: '#94a3b8', lineWidth: 0.75 }}
            />
            <SymbolLayer
              id="roomsLabels"
              style={{
                textField: ['get', 'name'],
                textFont: ['Noto Sans Regular'],
                textSize: 11,
                textColor: '#334155',
                textHaloColor: '#ffffff',
                textHaloWidth: 1.5,
                textAllowOverlap: false,
                textIgnorePlacement: false,
              }}
            />
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
              }}
            />
          </ShapeSource>
        ) : null}

        {destination ? (
          <MarkerView
            coordinate={[destination.lon, destination.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.destMarkerOuter}>
              <View style={styles.destMarkerInner} />
            </View>
          </MarkerView>
        ) : null}

        {showYouAreHere ? (
          <MarkerView
            coordinate={[currentStepPoint.lon, currentStepPoint.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.userDot} />
          </MarkerView>
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
        accessibilityLabel={`Map top is ${topLetter(effectiveHeading)}. Turn the map around`}
      >
        <Text style={styles.northButtonText}>
          {topLetter(effectiveHeading)}
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
    backgroundColor: '#f1f5f9',
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
    fontSize: 16,
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