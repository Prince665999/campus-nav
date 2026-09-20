// Walking Mode screen.
//
// Live map with the student's snapped position, the current
// instruction in a card below, and an off-route banner when needed.

import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { RouteMap } from '@/components/MapView';
import { InstructionCard } from '@/components/InstructionCard';
import { OffRouteBanner } from '@/components/OffRouteBanner';
import { useWalkingProgress } from '@/hooks/useWalkingProgress';
import { computeRoute } from '@/services/api';
import { t } from '@/i18n';

export default function WalkingScreen() {
  const { fromId, toId, routeJson } = useLocalSearchParams();

  // The route is passed in as a JSON string from the preview screen
  // (avoids re-fetching it). Fall back to fetching if it's missing.
  const [route, setRoute] = useState(() => {
    if (routeJson) {
      try {
        return JSON.parse(routeJson);
      } catch (_e) {
        return null;
      }
    }
    return null;
  });

  const [loading, setLoading] = useState(!route);
  const [error, setError] = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

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
    distanceRemainingM,
    distanceToNextStepM,
    offRoute,
    progress,
    resetOffRoute,
  } = useWalkingProgress(route);

  const handleRecalculate = useCallback(async () => {
    if (!position) return;
    setBannerDismissed(false);
    resetOffRoute();
    try {
      const data = await computeRoute({
        fromLat: position.lat,
        fromLon: position.lon,
        toPlaceId: Number(toId),
      });
      setRoute(data);
    } catch (_err) {
      // Silently keep the old route if recalculation fails — the
      // student is still moving and old directions are better than
      // none.
    }
  }, [position, toId, resetOffRoute]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Walking' }} />
        <View style={styles.state}>
          <ActivityIndicator color="#6b7280" />
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

  // Build markers: start and end from the route, plus the student's
  // snapped position when we have a fix.
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
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 15,
    textAlign: 'center',
    padding: 24,
    lineHeight: 22,
  },
  mapWrapper: { flex: 1 },
  map: { flex: 1 },
  cardWrapper: { backgroundColor: '#ffffff' },
});