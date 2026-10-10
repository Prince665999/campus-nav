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
//      toggle is on.
//
// The camera auto-fits to the room bounds on first render.

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
import { t } from '@/i18n';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';

// A minimal blank map style. Flat background, no tiles.
// The glyphs URL is required for room-name labels. Without it,
// MapLibre logs "Unable to parse resourceUrl" and labels never
// appear.
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

// MapLibre fill colour expression. Rooms white, corridors grey.
const FILL_COLOR_EXPR = [
  'match',
  ['get', 'type'],
  'corridor', '#e2e8f0',
  'room', '#ffffff',
  '#ffffff',
];

// Convert a level string to a short chip label.
function levelLabel(level) {
  if (level === '-1') return 'B';
  if (level === '0') return 'G';
  return level;
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
}) {
  const { settings } = useSettings();
  const cameraRef = useRef(null);

  // The floor currently being displayed. Starts as the current
  // step's level, but can be overridden by the floor switcher.
  const [selectedLevel, setSelectedLevel] = useState(level);

  const [areas, setAreas] = useState(null);
  const [availableLevels, setAvailableLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // When the building changes, reset the selected level to whatever
  // the current step says.
  useEffect(() => {
    setSelectedLevel(level);
  }, [buildingName]);

  // When the current step's level changes and the student has NOT
  // manually switched floors, follow it. If they HAVE manually
  // switched, respect their choice.
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

  // Route split — solid for current floor, dashed for other floors.
  //
  // The input is [{lat, lon, level}, ...]. We walk it and group
  // consecutive points by whether they match the selected level.
  // Each group becomes a LineString feature tagged with `dashed`.
  const { routeSolidGeoJSON, routeDashedGeoJSON } = useMemo(() => {
    if (!routeByLevel || routeByLevel.length === 0) {
      return { routeSolidGeoJSON: null, routeDashedGeoJSON: null };
    }
    if (routeByLevel.length === 1) {
      // A single point isn't a line. Skip.
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

  // Camera fit whenever the displayed floor's areas change.
  useEffect(() => {
    if (!cameraRef.current) return;
    if (loading) return;

    const points = [];
    if (areas) {
      for (const area of areas) {
        for (const p of area.boundary || []) {
          points.push([p.lon, p.lat]);
        }
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
    const span = Math.max(east - west, north - south);

    let zoom = 17;
    if (span > 0) zoom = 15 + Math.log2(0.0015 / span);
    zoom = Math.max(15, Math.min(20, zoom));

    const timeout = setTimeout(() => {
      try {
        cameraRef.current?.setCamera({
          centerCoordinate: [centerLon, centerLat],
          zoomLevel: zoom,
          animationDuration: 400,
        });
      } catch {
        // Silent.
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [areas, loading]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator color={COLORS.primaryDark} />
      </View>
    );
  }

  if (error) {
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

  // The "you are here" dot is shown only when the displayed floor
  // matches the current step's floor. Otherwise it would be in the
  // wrong place.
  const showYouAreHere =
    currentStepPoint && currentStepLevel === selectedLevel;

  const showSwitcher =
    settings.showFloorSwitcher !== false && availableLevels.length > 1;

  return (
    <View style={[styles.container, style]}>
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
            heading: 0,
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

        {/* Dashed — route on other floors. Drawn first so solid sits on top. */}
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

        {/* Solid — route on the displayed floor. */}
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

        {/* Destination marker. */}
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

        {/* You are here dot. Only shown when the displayed floor
            matches the current step's floor. */}
        {showYouAreHere ? (
          <MarkerView
            coordinate={[currentStepPoint.lon, currentStepPoint.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.userDot} />
          </MarkerView>
        ) : null}
      </MapView>

      {/* Floor switcher. Vertical chips on the right edge. */}
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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