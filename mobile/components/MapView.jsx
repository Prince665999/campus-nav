// MapView.jsx — MapLibre version with rotation and recentering.
//
// Two modes:
//   - outdoor: the tile map (as before).
//   - indoor:  the floor plan (IndoorMapView), which fetches rooms
//              and corridors for the current building+level. If the
//              API returns no rooms (unsurveyed building), we fall
//              back to IndoorMapPlaceholder.
//
// What's drawn on the outdoor map, bottom to top:
//
//   1. The route line.
//   2. The start and destination markers.
//   3. The accuracy circle — a polygon whose radius is the reported
//      GPS accuracy in metres. It's drawn under the dot so the dot
//      stays legible. Its presence tells the student that the dot
//      sitting a few metres off the line is the phone's uncertainty,
//      not the app being wrong.
//   4. The heading cone — a small triangle from the dot's position
//      in the direction of travel.
//   5. The dot — a CircleLayer (halo + dot).
//
// The dot is a CircleLayer rather than a MarkerView because a
// MarkerView is a React Native view on top of the map, and the
// native layer can lag or hold position while the camera is
// animating or rotating. A CircleLayer is drawn by MapLibre itself
// and can't lag.
//
// The camera is throttled: at most one update every
// CAMERA_MIN_INTERVAL_MS, and only when the student has moved at
// least CAMERA_MIN_MOVE_M or the heading has changed by at least
// CAMERA_MIN_HEADING_DEG. This stops the camera animation from
// being restarted several times a second around corners.

import { useMemo, useRef, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  MapView,
  Camera,
  ShapeSource,
  LineLayer,
  FillLayer,
  CircleLayer,
  MarkerView,
} from '@maplibre/maplibre-react-native';

import { IndoorMapPlaceholder } from '@/components/IndoorMapPlaceholder';
import { IndoorMapView } from '@/components/IndoorMapView';
import { haversineM } from '@/utils/geo';
import {
  CAMERA_MIN_INTERVAL_MS,
  CAMERA_MIN_MOVE_M,
  CAMERA_MIN_HEADING_DEG,
} from '@/constants/config';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_CENTER = [39.2000, -6.7500];

const CAMPUS_BOUNDS = {
  minLon: 33.30,
  maxLon: 33.55,
  minLat: -9.10,
  maxLat: -8.75,
};

// Above this accuracy (in metres) the accuracy circle stops being
// useful — it covers a whole block. We still draw the dot, just
// without the circle.
const ACCURACY_CIRCLE_MAX_M = 60;

function isWithinCampus(lon, lat) {
  return (
    lon >= CAMPUS_BOUNDS.minLon &&
    lon <= CAMPUS_BOUNDS.maxLon &&
    lat >= CAMPUS_BOUNDS.minLat &&
    lat <= CAMPUS_BOUNDS.maxLat
  );
}

function angularDifference(a, b) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

// A GeoJSON point for the user's position.
function userPointGeoJSON(userLocation) {
  if (!userLocation) return null;
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Point',
      coordinates: [userLocation.lon, userLocation.lat],
    },
  };
}

// A GeoJSON polygon approximating a circle of radius `radiusM`
// around `userLocation`. 32 vertices is plenty for a small circle
// and keeps the payload tiny.
function accuracyCircleGeoJSON(userLocation, radiusM) {
  if (!userLocation || radiusM == null || radiusM <= 0) return null;
  if (radiusM > ACCURACY_CIRCLE_MAX_M) return null;

  const METERS_PER_DEG_LAT = 111000;
  const METERS_PER_DEG_LON =
    111000 * Math.cos((userLocation.lat * Math.PI) / 180);

  const steps = 32;
  const ring = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const dLat = (radiusM * Math.cos(angle)) / METERS_PER_DEG_LAT;
    const dLon = (radiusM * Math.sin(angle)) / METERS_PER_DEG_LON;
    ring.push([userLocation.lon + dLon, userLocation.lat + dLat]);
  }
  // Close the ring.
  ring.push(ring[0]);

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
  };
}

// A small cone pointing in the direction of travel. About 12 m long
// and 8 m wide at the far end.
function userHeadingGeoJSON(userLocation, heading) {
  if (!userLocation || heading == null) return null;
  const METERS_PER_DEG_LAT = 111000;
  const METERS_PER_DEG_LON =
    111000 * Math.cos((userLocation.lat * Math.PI) / 180);

  const rad = (heading * Math.PI) / 180;
  const forwardLat =
    userLocation.lat + (12 * Math.cos(rad)) / METERS_PER_DEG_LAT;
  const forwardLon =
    userLocation.lon + (12 * Math.sin(rad)) / METERS_PER_DEG_LON;

  const leftAngle = rad - Math.PI / 6;
  const rightAngle = rad + Math.PI / 6;
  const leftLat =
    userLocation.lat + (8 * Math.cos(leftAngle)) / METERS_PER_DEG_LAT;
  const leftLon =
    userLocation.lon + (8 * Math.sin(leftAngle)) / METERS_PER_DEG_LON;
  const rightLat =
    userLocation.lat + (8 * Math.cos(rightAngle)) / METERS_PER_DEG_LAT;
  const rightLon =
    userLocation.lon + (8 * Math.sin(rightAngle)) / METERS_PER_DEG_LON;

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [userLocation.lon, userLocation.lat],
        [leftLon, leftLat],
        [forwardLon, forwardLat],
        [rightLon, rightLat],
        [userLocation.lon, userLocation.lat],
      ]],
    },
  };
}

export function RouteMap({
  geometry = [],
  markers = [],
  userLocation = null,
  accuracyM = null,
  bearing = null,
  followBearing = false,
  mode = 'outdoor',
  destinationName = null,
  indoorBuildingName = null,
  indoorLevel = null,
  indoorGeometry = [],
  indoorGeometryByLevel = [],
  indoorDestination = null,
  currentStepPoint = null,
  currentStepLevel = null,
  style,
}) {
  const cameraRef = useRef(null);

  const [indoorNoRooms, setIndoorNoRooms] = useState(false);

  useEffect(() => {
    setIndoorNoRooms(false);
  }, [indoorBuildingName, indoorLevel]);

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

  const userDot = useMemo(
    () => userPointGeoJSON(userLocation),
    [userLocation]
  );

  const userAccuracyCircle = useMemo(
    () => accuracyCircleGeoJSON(userLocation, accuracyM),
    [userLocation, accuracyM]
  );

  const userHeading = useMemo(
    () => userHeadingGeoJSON(userLocation, bearing),
    [userLocation, bearing]
  );

  // Camera throttle state.
  const lastCamRef = useRef({
    t: 0,
    lat: null,
    lon: null,
    heading: null,
  });

  useEffect(() => {
    if (mode !== 'outdoor') return;
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
    const span = Math.max(east - west, north - south);

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
  }, [routeCoords, mode]);

  // Follow camera. Throttled: at most one update every
  // CAMERA_MIN_INTERVAL_MS, and only when the student has moved at
  // least CAMERA_MIN_MOVE_M or the heading has changed by at least
  // CAMERA_MIN_HEADING_DEG.
  useEffect(() => {
    if (mode !== 'outdoor') return;
    if (!cameraRef.current) return;
    if (!userLocation) return;
    if (!isWithinCampus(userLocation.lon, userLocation.lat)) return;

    const now = Date.now();
    const last = lastCamRef.current;

    const movedM =
      last.lat != null && last.lon != null
        ? haversineM(last.lat, last.lon, userLocation.lat, userLocation.lon)
        : Infinity;

    const headingChanged =
      last.heading != null && bearing != null
        ? angularDifference(last.heading, bearing)
        : Infinity;

    if (
      now - last.t < CAMERA_MIN_INTERVAL_MS ||
      (movedM < CAMERA_MIN_MOVE_M && headingChanged < CAMERA_MIN_HEADING_DEG)
    ) {
      return;
    }

    lastCamRef.current = {
      t: now,
      lat: userLocation.lat,
      lon: userLocation.lon,
      heading: bearing ?? last.heading,
    };

    const update = {
      centerCoordinate: [userLocation.lon, userLocation.lat],
      animationDuration: 600,
    };
    if (followBearing && bearing != null) {
      update.heading = bearing;
    }

    try {
      cameraRef.current.setCamera(update);
    } catch {
      // Silent.
    }
  }, [userLocation, bearing, followBearing, mode]);

  if (mode === 'indoor') {
    if (indoorNoRooms) {
      return (
        <IndoorMapPlaceholder
          destinationName={destinationName}
          style={style}
        />
      );
    }
    return (
      <IndoorMapView
        buildingName={indoorBuildingName}
        level={indoorLevel}
        routeByLevel={indoorGeometryByLevel}
        destination={indoorDestination}
        currentStepPoint={currentStepPoint}
        currentStepLevel={currentStepLevel}
        style={style}
        onNoRooms={() => setIndoorNoRooms(true)}
      />
    );
  }

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

        {/* Accuracy circle — under the heading cone and the dot. */}
        {userAccuracyCircle ? (
          <ShapeSource id="userAccuracySource" shape={userAccuracyCircle}>
            <FillLayer
              id="userAccuracyFill"
              style={{
                fillColor: '#2563eb',
                fillOpacity: 0.12,
              }}
            />
          </ShapeSource>
        ) : null}

        {/* Heading cone. */}
        {userHeading ? (
          <ShapeSource id="userHeadingSource" shape={userHeading}>
            <FillLayer
              id="userHeadingFill"
              style={{
                fillColor: '#2563eb',
                fillOpacity: 0.25,
              }}
            />
          </ShapeSource>
        ) : null}

        {/* The dot — halo, then core. */}
        {userDot ? (
          <ShapeSource id="userSource" shape={userDot}>
            <CircleLayer
              id="userHalo"
              style={{
                circleRadius: 13,
                circleColor: '#2563eb',
                circleOpacity: 0.25,
              }}
            />
            <CircleLayer
              id="userDot"
              style={{
                circleRadius: 7,
                circleColor: '#2563eb',
                circleStrokeColor: '#ffffff',
                circleStrokeWidth: 2,
              }}
            />
          </ShapeSource>
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
});