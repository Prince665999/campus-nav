// Walking Mode screen.
//
// Live map with the student's snapped position, a compass arrow
// pointing at the next turn, spoken instructions, and an off-route
// banner when needed.

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { RouteMap } from '@/components/MapView';
import { InstructionCard } from '@/components/InstructionCard';
import { OffRouteBanner } from '@/components/OffRouteBanner';
import { useWalkingProgress } from '@/hooks/useWalkingProgress';
import { useCompass } from '@/hooks/useCompass';
import { useSettings } from '@/context/SettingsContext';
import { computeRoute } from '@/services/api';
import * as tts from '@/services/tts';
import { bearingDeg } from '@/utils/geo';
import { t } from '@/i18n';
import { COLORS } from '@/constants/theme';

export default function WalkingScreen() {
  const { fromId, toId, routeJson } = useLocalSearchParams();

  const [route, setRoute] = useState(() => {
    if (routeJson) {
      try {
        return JSON.parse(routeJson);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [loading, setLoading] = useState(!route);
  const [error, setError] = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const { settings } = useSettings();
  const { heading } = useCompass();

  // Load the route if it wasn't passed in.
  useState(() => {
    if (route) return;
    async function load() {
      try {
        const data = await computeRoute({
          fromPlaceId: Number(fromId),
          toPlaceId: Number(toId),
        });
        setRoute(data);
      } catch (err) {
        setError(err.message || t('common.error'));
      } finally {
        setLoading(false);
      }
    }
    load();
  });

  const {
    permissionGranted,
    position,
    currentStep,
    currentStepIndex,
    distanceRemainingM,
    distanceToNextStepM,
    offRoute,
    progress,
    resetOffRoute,
  } = useWalkingProgress(route);

  // Speak each instruction once when it becomes current.
  useEffect(() => {
    if (!settings.voiceEnabled) return;
    if (!currentStep) return;
    tts.speak(currentStep.instruction, { rate: settings.voiceRate });
  }, [currentStep, settings.voiceEnabled, settings.voiceRate]);

  // Stop speech when leaving the screen.
  useEffect(() => {
    return () => {
      tts.stop();
    };
  }, []);

  // Bearing from the student's current position to the next step's
  // location, or to the destination if on the last step. Used to
  // point the compass arrow.
  //
  // The next step's location isn't in the route response (steps only
  // have at_m), so we approximate: use the geometry point at that
  // distance along the route. Simpler and accurate enough for a
  // campus walk.
  const bearing = (() => {
    if (!position || !route || !route.geometry || route.geometry.length < 2) {
      return null;
    }
    // Compute the target distance along the route.
    const steps = route.steps;
    let targetAtM;
    if (currentStepIndex < steps.length - 1) {
      targetAtM = steps[currentStepIndex + 1].at_m;
    } else {
      targetAtM = route.distance_m;
    }

    // Walk the geometry accumulating distance until we reach targetAtM.
    let cumulative = 0;
    for (let i = 0; i < route.geometry.length - 1; i++) {
      const a = route.geometry[i];
      const b = route.geometry[i + 1];
      const segLen = haversine(a.lat, a.lon, b.lat, b.lon);
      if (cumulative + segLen >= targetAtM) {
        const fraction = (targetAtM - cumulative) / segLen;
        const targetLat = a.lat + (b.lat - a.lat) * fraction;
        const targetLon = a.lon + (b.lon - a.lon) * fraction;
        return bearingDeg(position.lat, position.lon, targetLat, targetLon);
      }
      cumulative += segLen;
    }
    // Fallback: bearing to the last geometry point.
    const last = route.geometry[route.geometry.length - 1];
    return bearingDeg(position.lat, position.lon, last.lat, last.lon);
  })();

  const handleRecalculate = useCallback(async () => {
    if (!position) return;
    setBannerDismissed(false);
    resetOffRoute();
    tts.reset();
    try {
      const data = await computeRoute({
        fromLat: position.lat,
        fromLon: position.lon,
        toPlaceId: Number(toId),
      });
      setRoute(data);
    } catch {
      // Silently keep the old route if recalculation fails.
    }
  }, [position, toId, resetOffRoute]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Walking' }} />
        <View style={styles.state}>
          <ActivityIndicator color={COLORS.textMuted} />
        </View>
      </>
    );
  }

  if (error || !route) {
    return (
      <>
        <Stack.Screen options={{ title: 'Walking' }} />
        <View style={styles.state}>
          <Text style={styles.errorText}>{error || t('common.error')}</Text>
        </View>
      </>
    );
  }

  if (permissionGranted === false) {
    return (
      <>
        <Stack.Screen options={{ title: 'Walking' }} />
        <View style={styles.state}>
          <Text style={styles.errorText}>
            Location permission is needed to guide you.
          </Text>
        </View>
      </>
    );
  }

  const markers = [
    {
      lat: route.geometry[0].lat,
      lon: route.geometry[0].lon,
      title: route.from_name,
    },
    {
      lat: route.geometry[route.geometry.length - 1].lat,
      lon: route.geometry[route.geometry.length - 1].lon,
      title: route.to_name,
    },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Walking',
          headerBackVisible: false,
        }}
      />
      <View style={styles.container}>
        {offRoute && !bannerDismissed ? (
          <OffRouteBanner
            onRecalculate={handleRecalculate}
            onDismiss={() => setBannerDismissed(true)}
          />
        ) : null}

        <View style={styles.mapWrapper}>
          <RouteMap
            geometry={route.geometry}
            markers={markers}
            userLocation={position}
            style={styles.map}
          />
        </View>

        <View style={styles.cardWrapper}>
          <InstructionCard
            step={currentStep}
            distanceToNextStepM={distanceToNextStepM}
            distanceRemainingM={distanceRemainingM}
            progress={progress}
            heading={heading}
            bearing={bearing}
          />
        </View>
      </View>
    </>
  );
}

// Local haversine — same formula as utils/geo.js, inlined here to
// avoid importing the whole module for one call inside a render.
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundSubtle,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 15,
    textAlign: 'center',
    padding: 24,
    lineHeight: 22,
  },
  mapWrapper: { flex: 1 },
  map: { flex: 1 },
  cardWrapper: { backgroundColor: COLORS.background },
});