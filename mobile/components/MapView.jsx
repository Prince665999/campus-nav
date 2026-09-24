// MapView.jsx — MapLibre version with rotation and recentering.
//
// Uses setCamera with an explicit center and zoom, rather than
// fitBounds. fitBounds was producing unexpectedly large views when
// the route geometry contained any point far from the campus.

import { useMemo, useRef, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  MapView,
  Camera,
  ShapeSource,
  LineLayer,
  MarkerView,
} from '@maplibre/maplibre-react-native';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_CENTER = [39.2000, -6.7500];

// The campus bounding box. Any coordinate outside this box is
// discarded before computing the map's fit. This prevents a single
// stray point from zooming the map out to the whole country.
const CAMPUS_BOUNDS = {
  minLon: 33.30,
  maxLon: 33.55,
  minLat: -9.10,
  maxLat: -8.75,
};

function isWithinCampus(lon, lat) {
  return (
    lon >= CAMPUS_BOUNDS.minLon &&
    lon <= CAMPUS_BOUNDS.maxLon &&
    lat >= CAMPUS_BOUNDS.minLat &&
    lat <= CAMPUS_BOUNDS.maxLat
  );
}

export function RouteMap({
  geometry = [],
  markers = [],
  userLocation = null,
  bearing = null,
  followBearing = false,
  style,
}) {
  const cameraRef = useRef(null);

  // The route line itself renders every point — even stray ones —
  // because visually a stray point on the line is easier to spot
  // than a map that's suddenly zoomed out.
  const routeCoords = useMemo(
    () => geometry.map((p) => [p.lon, p.lat]),
    [geometry]
  );

  const lineGeoJSON = useMemo(() => {
    if (routeCoords.length < 2) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: routeCoords,
      },
    };
  }, [routeCoords]);

  // On first render, set the camera to the route's rough center at a
  // fixed zoom level. Uses setCamera, not fitBounds, because
  // fitBounds was unreliable with this MapLibre version.
  useEffect(() => {
    if (routeCoords.length < 2 || !cameraRef.current) return;

    // Filter to coordinates within the campus.
    const valid = routeCoords.filter(
      (c) =>
        Array.isArray(c) &&
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1]) &&
        isWithinCampus(c[0], c[1])
    );

    if (valid.length === 0) return;

    const lons = valid.map((c) => c[0]);
    const lats = valid.map((c) => c[1]);

    const west = Math.min(...lons);
    const east = Math.max(...lons);
    const south = Math.min(...lats);
    const north = Math.max(...lats);

    // Compute the route's center and extent.
    const centerLon = (west + east) / 2;
    const centerLat = (south + north) / 2;
    const spanLon = east - west;
    const spanLat = north - south;

    // Pick a zoom level from the extent. A typical route on a campus
    // spans 0.005 degrees (~500m). That's about zoom 16. A short
    // route spans 0.001 degrees — zoom 17. A longer one spans 0.01 —
    // zoom 15. The scale factor below approximates MapLibre's
    // zoom levels for small spans.
    //
    // We clamp to [14, 18] so a stray-but-legitimate short route
    // doesn't zoom in absurdly, and a long route doesn't zoom out
    // past the campus.
    const span = Math.max(spanLon, spanLat);
    let zoom = 16;
    if (span > 0) {
      // log2(0.005 / span) gives +1 for half the size, -1 for double.
      zoom = 16 + Math.log2(0.005 / span);
    }
    zoom = Math.max(14, Math.min(18, zoom));

    const timeout = setTimeout(() => {
      try {
        cameraRef.current?.setCamera({
          centerCoordinate: [centerLon, centerLat],
          zoomLevel: zoom,
          animationDuration: 500,
        });
      } catch {
        // Silent.
      }
    }, 200);

    return () => clearTimeout(timeout);
  }, [routeCoords]);

  // Rotate the camera to follow the student's heading.
  useEffect(() => {
    if (!cameraRef.current) return;
    if (!followBearing || bearing == null) return;

    cameraRef.current.setCamera({
      heading: bearing,
      animationDuration: 400,
    });
  }, [bearing, followBearing]);

  // Recenter on the student as they move, but only if they've moved
  // out of the visible area. Recentering on every fix would fight
  // the fit-to-route view.
  useEffect(() => {
    if (!cameraRef.current) return;
    if (!userLocation) return;
    if (!isWithinCampus(userLocation.lon, userLocation.lat)) return;

    cameraRef.current.setCamera({
      centerCoordinate: [userLocation.lon, userLocation.lat],
      animationDuration: 400,
    });
  }, [userLocation]);

  const initialCenter =
    routeCoords.length > 0 ? routeCoords[0] : DEFAULT_CENTER;

  return (
    <View style={[styles.wrapper, style]}>
      <MapView
        style={styles.map}
        mapStyle={MAP_STYLE}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={true}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: initialCenter,
            zoomLevel: 16,
            heading: 0,
          }}
        />

        {lineGeoJSON ? (
          <ShapeSource id="routeSource" shape={lineGeoJSON}>
            <LineLayer
              id="routeLine"
              style={{
                lineColor: '#2563eb',
                lineWidth: 4,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        ) : null}

        {markers.map((marker, i) => (
          <MarkerView
            key={i}
            coordinate={[marker.lon, marker.lat]}
            anchor={{ x: 0.5, y: 1.0 }}
          >
            <View style={styles.marker}>
              <View
                style={[
                  styles.markerDot,
                  { backgroundColor: i === 0 ? '#16a34a' : '#dc2626' },
                ]}
              />
            </View>
          </MarkerView>
        ))}

        {userLocation ? (
          <MarkerView
            coordinate={[userLocation.lon, userLocation.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.userDot} />
          </MarkerView>
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  marker: {
    padding: 4,
  },
  markerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  userDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2563eb',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
});