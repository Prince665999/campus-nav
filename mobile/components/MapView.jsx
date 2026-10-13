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
//
// Route-up preview
// ----------------
// When this component is used as a preview (followBearing = false),
// the initial fit turns the map so the route runs from bottom to top
// of the screen. This is a one-shot turn, not a continuous follow.
// The walking screen passes followBearing = true, so it skips the
// preview heading entirely and follows the walker's compass.
//
// The preview gets its own N/S flip button (top-right). It shows
// which compass direction is at the top of the screen right now.
// One press turns the map 180°.
//
// The fit runs only after `onDidFinishLoadingMap` fires, so a
// setCamera call isn't dropped while the native map is still
// loading.
//
// Walking screen is untouched by all of this: it passes
// followBearing = true and the whole preview block is skipped.

import { useMemo, useRef, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { haversineM, bearingDeg } from '@/utils/geo';
import {
  CAMERA_MIN_INTERVAL_MS,
  CAMERA_MIN_MOVE_M,
  CAMERA_MIN_HEADING_DEG,
} from '@/constants/config';
import { COLORS } from '@/constants/theme';

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

// The preview fit pulls back by this many zoom levels when the map
// is rotated, because a diagonal route can push its ends toward the
// screen edges once the map is turned.
const PREVIEW_HEADING_ZOOM_OFFSET = 0.5;

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

  // Preview-only: gate the initial fit on the native map being
  // loaded, so setCamera({ heading }) isn't dropped while the map is
  // still initialising. On the walking screen (followBearing = true)
  // this state is set but never used.
  const [mapReady, setMapReady] = useState(false);

  // Preview-only: 0°/180° flip. Chosen from the route's overall
  // bearing, toggled by the button. Irrelevant on the walking screen.
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setIndoorNoRooms(false);
  }, [indoorBuildingName, indoorLevel]);

  // Reset the flip when the route changes, so a new route starts on
  // its own preferred side rather than inheriting the previous flip.
  useEffect(() => {
    setFlipped(false);
  }, [geometry]);

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

  // The route's overall bearing, from first point to last. Null when
  // the walking screen is using this map (followBearing is true), or
  // when the route is too short for a meaningful bearing.
  const previewHeading = useMemo(() => {
    if (followBearing) return null;
    if (routeCoords.length < 2) return null;
    const first = routeCoords[0];             // [lon, lat]
    const last = routeCoords[routeCoords.length - 1];
    return bearingDeg(first[1], first[0], last[1], last[0]);
  }, [routeCoords, followBearing]);

  // The base orientation for the preview, snapped to 0 or 180.
  // Same idea as the indoor map's baseHeading: only two values, so
  // the map never sits at a skew angle.
  const previewBaseHeading = useMemo(() => {
    if (previewHeading == null) return null;
    return Math.cos((previewHeading * Math.PI) / 180) >= 0 ? 0 : 180;
  }, [previewHeading]);

  // Effective heading, including the flip.
  const mapHeading =
    previewBaseHeading == null
      ? null
      : (previewBaseHeading + (flipped ? 180 : 0)) % 360;

  // Fit parameters, computed once per route. Used by the fit effect
  // once mapReady is true.
  const fit = useMemo(() => {
    if (routeCoords.length < 2) return null;
    const valid = routeCoords.filter(
      (c) =>
        Array.isArray(c) &&
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1]) &&
        isWithinCampus(c[0], c[1])
    );
    if (valid.length === 0) return null;

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

    return { center: [centerLon, centerLat], zoom };
  }, [routeCoords]);

  // Camera throttle state — used only on the walking screen.
  const lastCamRef = useRef({
    t: 0,
    lat: null,
    lon: null,
    heading: null,
  });

  // Preview fit. Only runs when followBearing is false, when the
  // native map has finished loading, and when we have a fit and a
  // heading.
  useEffect(() => {
    if (mode !== 'outdoor') return;
    if (followBearing) return;
    if (!mapReady) return;
    if (!cameraRef.current) return;
    if (!fit) return;

    const cam = {
      centerCoordinate: fit.center,
      zoomLevel:
        mapHeading != null
          ? fit.zoom - PREVIEW_HEADING_ZOOM_OFFSET
          : fit.zoom,
      animationDuration: 500,
    };
    if (mapHeading != null) {
      cam.heading = mapHeading;
    }

    // eslint-disable-next-line no-console
    console.log('[preview fit]', {
      mapHeading,
      base: previewBaseHeading,
      flipped,
      zoom: cam.zoomLevel,
      points: routeCoords.length,
    });

    try {
      cameraRef.current.setCamera(cam);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[preview fit] setCamera failed:', e && e.message);
    }
  }, [
    mode,
    followBearing,
    mapReady,
    fit,
    mapHeading,
    previewBaseHeading,
    flipped,
    routeCoords.length,
  ]);

  // Follow camera (walking screen only). Throttled: at most one
  // update every CAMERA_MIN_INTERVAL_MS, and only when the student
  // has moved at least CAMERA_MIN_MOVE_M or the heading has changed
  // by at least CAMERA_MIN_HEADING_DEG.
  useEffect(() => {
    if (mode !== 'outdoor') return;
    if (!followBearing) return;
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
    if (bearing != null) {
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

  const initialCenter = fit ? fit.center : DEFAULT_CENTER;

  // The button label: N or S, whichever is currently at the top of
  // the screen. Only shown in preview mode.
  const showFlipButton =
    !followBearing && mode === 'outdoor' && mapHeading != null;
  const topLabel = mapHeading === 0 ? 'N' : 'S';

  return (
    <View style={[styles.wrapper, style]}>
      <MapView
        style={styles.map}
        mapStyle={MAP_STYLE}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={followBearing}
        onDidFinishLoadingMap={() => setMapReady(true)}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: initialCenter,
            zoomLevel: fit ? fit.zoom : 16,
            heading: mapHeading != null ? mapHeading : 0,
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

      {/* Preview flip button. Shows which compass direction is at the
          top of the screen right now. One press turns the map 180°. */}
      {showFlipButton ? (
        <TouchableOpacity
          style={styles.flipButton}
          onPress={() => setFlipped((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={
            topLabel === 'N' ? 'Flip map to south-up' : 'Flip map to north-up'
          }
        >
          <Text style={styles.flipButtonText}>{topLabel}</Text>
        </TouchableOpacity>
      ) : null}
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
  flipButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
});