// MapView.jsx — MapLibre version with rotation and recentering.

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

  // Fit the map to the route on first render and when the route
  // changes. Only runs when the route is stable — a mid-recompute
  // empty geometry is skipped.
  useEffect(() => {
    if (routeCoords.length < 2 || !cameraRef.current) return;

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

    const centerLon = (west + east) / 2;
    const centerLat = (south + north) / 2;
    const spanLon = east - west;
    const spanLat = north - south;

    const span = Math.max(spanLon, spanLat);
    let zoom = 16;
    if (span > 0) {
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

  // Single effect for real-time camera updates. Position and
  // heading are set in one call, so the map moves and rotates
  // atomically rather than in two separate animations.
  useEffect(() => {
    if (!cameraRef.current) return;
    if (!userLocation) return;
    if (!isWithinCampus(userLocation.lon, userLocation.lat)) return;

    const update = {
      centerCoordinate: [userLocation.lon, userLocation.lat],
      animationDuration: 300,
    };

    if (followBearing && bearing != null) {
      update.heading = bearing;
    }

    try {
      cameraRef.current.setCamera(update);
    } catch {
      // Silent.
    }
  }, [userLocation, bearing, followBearing]);

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