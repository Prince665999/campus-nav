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

  // Fit the map to the route, with guards against malformed bounds.
  useEffect(() => {
    if (routeCoords.length < 2 || !cameraRef.current) return;

    const lons = routeCoords
      .map((c) => c[0])
      .filter((n) => Number.isFinite(n));
    const lats = routeCoords
      .map((c) => c[1])
      .filter((n) => Number.isFinite(n));

    if (lons.length === 0 || lats.length === 0) return;

    const west = Math.min(...lons);
    const east = Math.max(...lons);
    const south = Math.min(...lats);
    const north = Math.max(...lats);

    if (
      !Number.isFinite(west) ||
      !Number.isFinite(east) ||
      !Number.isFinite(south) ||
      !Number.isFinite(north)
    ) {
      return;
    }

    if (east - west < 1e-6 && north - south < 1e-6) return;

    const bounds = [west, south, east, north];
    const padding = [60, 40, 60, 40];

    const timeout = setTimeout(() => {
      try {
        cameraRef.current?.fitBounds(bounds, padding, 500);
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

  // Recenter on the student as they move.
  useEffect(() => {
    if (!cameraRef.current) return;
    if (!userLocation) return;

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