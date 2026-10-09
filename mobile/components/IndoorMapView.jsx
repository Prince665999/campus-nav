// IndoorMapView — draws the indoor floor plan.
//
// When the walking screen's current step is indoor, this component
// replaces the outdoor tile map. It:
//   1. Fetches the rooms and corridors for the current building+level
//      from /api/indoor/areas.
//   2. Renders them on a blank MapLibre map: rooms filled light grey,
//      corridors a slightly different shade, room names as labels.
//   3. Draws the indoor portion of the route as a blue line.
//   4. Marks the destination with a red marker.
//
// The camera auto-fits to the room bounds on first render.
//
// If the API returns no rooms (unsurveyed building), we render
// nothing and the parent falls back to IndoorMapPlaceholder.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
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
import { COLORS } from '@/constants/theme';

// A minimal blank map style. No tiles, no outlines, no country
// boundaries — just a flat background for the floor plan.
//
// The glyphs URL is required: MapLibre downloads font glyphs from
// here to render text in SymbolLayer. Without it, MapLibre logs
// "Unable to parse resourceUrl" on every redraw and room labels
// never appear.
//
// The style is passed as a JSON string rather than an object because
// MapLibre RN versions differ in how they handle inline objects —
// a string is stable across renders and avoids unnecessary reloads.
const BLANK_STYLE = JSON.stringify({
  version: 8,
  name: 'indoor-blank',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#f1f5f9',
      },
    },
  ],
});

export function IndoorMapView({
  buildingName,
  level,
  routeGeometry = [],
  destination = null,
  style,
  onNoRooms,
}) {
  const cameraRef = useRef(null);

  const [areas, setAreas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch rooms and corridors whenever the building or level changes.
  useEffect(() => {
    let cancelled = false;

    if (!buildingName || level == null) {
      setAreas([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);

    getIndoorAreas({ buildingName, level })
      .then((data) => {
        if (cancelled) return;
        const list = data?.areas || [];
        setAreas(list);
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
  }, [buildingName, level]);

  // -------------------------------------------------------------------------
  // GeoJSON assembly
  // -------------------------------------------------------------------------

  const { roomsGeoJSON, corridorsGeoJSON } = useMemo(() => {
    if (!areas || areas.length === 0) {
      return { roomsGeoJSON: null, corridorsGeoJSON: null };
    }

    const rooms = [];
    const corridors = [];

    for (const area of areas) {
      const ring = (area.boundary || []).map((p) => [p.lon, p.lat]);
      if (ring.length === 0) continue;
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([first[0], first[1]]);
      }

      const feature = {
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

      if (area.type === 'corridor') corridors.push(feature);
      else rooms.push(feature);
    }

    return {
      roomsGeoJSON: { type: 'FeatureCollection', features: rooms },
      corridorsGeoJSON: { type: 'FeatureCollection', features: corridors },
    };
  }, [areas]);

  const routeGeoJSON = useMemo(() => {
    if (!routeGeometry || routeGeometry.length < 2) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: routeGeometry.map((p) => [p.lon, p.lat]),
      },
    };
  }, [routeGeometry]);

  // Camera fit — compute a bounding box from areas and route.
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
    if (routeGeometry) {
      for (const p of routeGeometry) {
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
    const span = Math.max(east - west, north - south);

    let zoom = 17;
    if (span > 0) {
      zoom = 15 + Math.log2(0.0015 / span);
    }
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
  }, [areas, routeGeometry, loading]);

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

        {/* Corridors first, so rooms sit on top. */}
        {corridorsGeoJSON && corridorsGeoJSON.features.length > 0 ? (
          <ShapeSource id="corridorsSource" shape={corridorsGeoJSON}>
            <FillLayer
              id="corridorsFill"
              style={{
                fillColor: '#e2e8f0',
                fillOpacity: 1,
              }}
            />
            <LineLayer
              id="corridorsOutline"
              style={{
                lineColor: '#cbd5e1',
                lineWidth: 0.5,
              }}
            />
          </ShapeSource>
        ) : null}

        {/* Rooms. */}
        {roomsGeoJSON && roomsGeoJSON.features.length > 0 ? (
          <ShapeSource id="roomsSource" shape={roomsGeoJSON}>
            <FillLayer
              id="roomsFill"
              style={{
                fillColor: '#ffffff',
                fillOpacity: 1,
              }}
            />
            <LineLayer
              id="roomsOutline"
              style={{
                lineColor: '#94a3b8',
                lineWidth: 0.75,
              }}
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

        {/* Route line on top of everything. */}
        {routeGeoJSON ? (
          <ShapeSource id="indoorRouteSource" shape={routeGeoJSON}>
            <LineLayer
              id="indoorRouteLine"
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
            anchor={{ x: 0.5, y: 1.0 }}
          >
            <View style={styles.destMarkerOuter}>
              <View style={styles.destMarkerInner} />
            </View>
          </MarkerView>
        ) : null}
      </MapView>
    </View>
  );
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
});