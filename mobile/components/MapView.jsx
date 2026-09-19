// MapView.jsx — MapLibre version.
//
// This replaces the react-native-maps version. The public interface
// is identical: geometry, markers, style. Nothing outside this file
// changes.
//
// IMPORTANT: MapLibre requires the MapView to have flex: 1 or explicit
// height/width. Without it, the map renders at zero size and you see
// nothing. This is the single most common MapLibre bug on Android.

import { useMemo, useRef, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  MapView,
  Camera,
  ShapeSource,
  LineLayer,
  MarkerView,
} from '@maplibre/maplibre-react-native';

// OpenFreeMap Liberty — free, no API key, no account.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const DEFAULT_CENTER = [39.2000, -6.7500]; // [lon, lat] — note the order

export function RouteMap({
  geometry = [],
  markers = [],
  userLocation = null,
  style,
}) {
  const cameraRef = useRef(null);

  // MapLibre uses GeoJSON coordinate order: [longitude, latitude].
  // The API gives us { lat, lon }. Convert here.
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

  // Fit the camera to the route when it appears.
  useEffect(() => {
    if (routeCoords.length < 2 || !cameraRef.current) return;

    const lons = routeCoords.map((c) => c[0]);
    const lats = routeCoords.map((c) => c[1]);
    const bounds = {
      ne: [Math.max(...lons), Math.max(...lats)],
      sw: [Math.min(...lons), Math.min(...lats)],
      paddingTop: 40,
      paddingRight: 40,
      paddingBottom: 40,
      paddingLeft: 40,
    };

    const timeout = setTimeout(() => {
      cameraRef.current?.setCamera({
        bounds,
        animationDuration: 500,
      });
    }, 200);

    return () => clearTimeout(timeout);
  }, [routeCoords]);

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
    // flex: 1 is REQUIRED. Without it the map collapses to 0px on Android.
    // The parent container in route-preview.jsx has height: 280, so
    // flex: 1 fills that.
    flex: 1,
  },
  marker: {
    // MapLibre clips marker children that extend outside these bounds
    // on Android. A small padding prevents the pin from being cut off.
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