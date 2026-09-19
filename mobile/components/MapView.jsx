// Map component. Wraps react-native-maps.
//
// Draws:
//   - the campus map (whatever the device provides)
//   - the route line, if a geometry array is given
//   - start and end markers
//   - optionally, the user's position (Phase 6)
//
// All coordinates come from the API as { lat, lon }. react-native-maps
// wants { latitude, longitude }. This component converts.

import { useMemo, useRef, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

// Default view if no route is given: this is only a fallback. A real
// map view should always come with at least one coordinate to center
// on, but if none is provided we still need to render something.
const DEFAULT_REGION = {
  latitude: -6.7500,
  longitude: 39.2000,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

export function RouteMap({
  geometry = [],
  markers = [],
  userLocation = null,
  style,
}) {
  const mapRef = useRef(null);

  // Convert API coords to react-native-maps coords.
  const routeCoords = useMemo(
    () =>
      geometry.map((p) => ({
        latitude: p.lat,
        longitude: p.lon,
      })),
    [geometry]
  );

  const markerCoords = useMemo(
    () =>
      markers.map((m) => ({
        latitude: m.lat,
        longitude: m.lon,
        title: m.title,
        description: m.description,
      })),
    [markers]
  );

  // Fit the map to the route the first time it appears.
  useEffect(() => {
    if (routeCoords.length < 2 || !mapRef.current) return;
    // react-native-maps' fitToCoordinates expects a small delay when
    // the map just mounted, otherwise it fits to the pre-layout size.
    const timeout = setTimeout(() => {
      mapRef.current?.fitToCoordinates(routeCoords, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    }, 200);
    return () => clearTimeout(timeout);
  }, [routeCoords]);

  const initialRegion = useMemo(() => {
    if (routeCoords.length > 0) {
      return {
        latitude: routeCoords[0].latitude,
        longitude: routeCoords[0].longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };
    }
    return DEFAULT_REGION;
  }, [routeCoords]);

  return (
    <View style={[styles.wrapper, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={true}
        toolbarEnabled={false}
      >
        {routeCoords.length > 1 ? (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#2563eb"
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}

        {markerCoords.map((coord, i) => (
          <Marker
            key={i}
            coordinate={{ latitude: coord.latitude, longitude: coord.longitude }}
            title={coord.title}
            description={coord.description}
            pinColor={i === 0 ? '#16a34a' : '#dc2626'}
          />
        ))}

        {userLocation ? (
          <Marker
            coordinate={{
              latitude: userLocation.lat,
              longitude: userLocation.lon,
            }}
            pinColor="#2563eb"
            title="You are here"
          />
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
    ...StyleSheet.absoluteFillObject,
  },
});