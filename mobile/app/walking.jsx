// Walking Mode screen.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { RouteMap } from '@/components/MapView';
import { InstructionCard } from '@/components/InstructionCard';
import { OffRouteBanner } from '@/components/OffRouteBanner';
import { ApproachPhoto } from '@/components/ApproachPhoto';
import { ReportSheet } from '@/components/ReportSheet';
import { WifiBanner } from '@/components/WifiBanner';
import { useWalkingProgress } from '@/hooks/useWalkingProgress';
import { useCompass } from '@/hooks/useCompass';
import { useNearbyWifi } from '@/hooks/useNearbyWifi';
import { useSettings } from '@/context/SettingsContext';
import { updateCachedPosition } from '@/hooks/useStartingPoint';
import { computeRoute, listMediaForPlace, recordRecent } from '@/services/api';
import { closestApproachPhoto } from '@/utils/media';
import * as tts from '@/services/tts';
import * as haptics from '@/services/haptics';
import { bearingDeg } from '@/utils/geo';
import { t, ttsLanguageForCurrentLang } from '@/i18n';
import { COLORS, TOUCH } from '@/constants/theme';
import { ICONS } from '@/constants/icons';

const APPROACH_PHOTO_DISTANCE_M = 60;
const ARRIVAL_DISTANCE_M = 15;

// How many seconds after entering Walking Mode before we recompute
// the route from the live position. Short enough that the student
// sees the correct route quickly, long enough for a GPS fix.
const RECOMPUTE_AFTER_MS = 3000;

export default function WalkingScreen() {
  const { fromId, toId, fromLat, fromLon, routeJson } =
    useLocalSearchParams();

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
  const [approachPhotos, setApproachPhotos] = useState([]);
  const [photoDismissed, setPhotoDismissed] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const arrivedRef = useRef(false);
  // Track whether we've already recomputed from the live position
  // for this walk. Only do it once per entry.
  const recomputedRef = useRef(false);

  const { settings } = useSettings();
  const { heading } = useCompass();

  // Load the route if it wasn't passed in.
  useState(() => {
    if (route) return;
    async function load() {
      try {
        const data = await computeRoute({
          fromPlaceId: fromId ? Number(fromId) : null,
          toPlaceId: Number(toId),
          fromLat: fromLat ? Number(fromLat) : null,
          fromLon: fromLon ? Number(fromLon) : null,
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

  // Load destination photos once.
  useEffect(() => {
    let cancelled = false;
    listMediaForPlace(Number(toId))
      .then((items) => {
        if (!cancelled) setApproachPhotos(items);
      })
      .catch(() => {
        if (!cancelled) setApproachPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [toId]);

  // Record this destination as a recent visit.
  useEffect(() => {
    recordRecent(Number(toId)).catch(() => {});
  }, [toId]);

  const {
    permissionGranted,
    position,
    rawPosition,
    currentStep,
    currentStepIndex,
    distanceRemainingM,
    distanceToNextStepM,
    offRoute,
    progress,
    resetOffRoute,
  } = useWalkingProgress(route);

  // Recompute the route from the student's live position, once,
  // shortly after the walk starts. The route passed from preview was
  // computed at whatever position the student was in when they
  // tapped Take me there. By the time they're actually walking,
  // they've moved, and the route may not align with where they are.
  //
  // Recomputation is cheap — the endpoint is cached — and it means
  // the snapped position lands on the route instead of beside it.
  useEffect(() => {
    if (recomputedRef.current) return;
    if (!rawPosition) return;

    const timer = setTimeout(() => {
      if (recomputedRef.current) return;
      if (!rawPosition) return;

      recomputedRef.current = true;

      computeRoute({
        fromLat: rawPosition.lat,
        fromLon: rawPosition.lon,
        toPlaceId: Number(toId),
      })
        .then((data) => {
          if (data) {
            setRoute(data);
            resetOffRoute();
          }
        })
        .catch(() => {
          // Keep the original route if recomputation fails.
        });
    }, RECOMPUTE_AFTER_MS);

    return () => clearTimeout(timer);
  }, [rawPosition, toId, resetOffRoute]);

  // Cache the current position so other screens can use it as a
  // starting point without asking for location again.
  useEffect(() => {
    if (position) {
      updateCachedPosition({ lat: position.lat, lon: position.lon });
    }
  }, [position]);

  // Wi-Fi proximity.
  const { spot: wifiSpot, dismiss: dismissWifi } = useNearbyWifi({
    position,
    enabled: settings.wifiProximityEnabled,
  });

  // Speak each instruction once when it becomes current.
  useEffect(() => {
    if (!settings.voiceEnabled) return;
    if (!currentStep) return;
    tts.speak(currentStep.instruction, {
      rate: settings.voiceRate,
      lang: ttsLanguageForCurrentLang(),
    });
  }, [currentStep, settings.voiceEnabled, settings.voiceRate]);

  // Haptic pulse when the current step changes.
  useEffect(() => {
    if (!currentStep) return;
    if (currentStepIndex === 0) return;
    haptics.turnPulse();
  }, [currentStepIndex, currentStep]);

  // Warning pulse when the student goes off-route.
  useEffect(() => {
    if (offRoute) {
      haptics.offRoutePulse();
    }
  }, [offRoute]);

  // Stop speech when leaving the screen.
  useEffect(() => {
    return () => {
      tts.stop();
    };
  }, []);

  // When the student arrives, go to the arrival screen.
  useEffect(() => {
    if (arrivedRef.current) return;
    if (!route) return;
    if (distanceRemainingM > ARRIVAL_DISTANCE_M) return;
    arrivedRef.current = true;
    haptics.arrivalPulse();
    router.replace({
      pathname: '/arrival',
      params: { toId: String(toId) },
    });
  }, [distanceRemainingM, route, toId]);

  // Pick the approach photo whose bearing best matches the direction
  // we're approaching from.
  const approachPhoto = (() => {
    if (approachPhotos.length === 0) return null;
    if (distanceRemainingM > APPROACH_PHOTO_DISTANCE_M) return null;

    if (!position || !route?.geometry?.length) {
      return approachPhotos.find((p) => p.is_primary) || approachPhotos[0];
    }

    const last = route.geometry[route.geometry.length - 1];
    const approachBearing = bearingDeg(
      position.lat,
      position.lon,
      last.lat,
      last.lon
    );

    return closestApproachPhoto(approachPhotos, approachBearing);
  })();

  const bearing = (() => {
    if (!position || !route || !route.geometry || route.geometry.length < 2) {
      return null;
    }
    const steps = route.steps;
    let targetAtM;
    if (currentStepIndex < steps.length - 1) {
      targetAtM = steps[currentStepIndex + 1].at_m;
    } else {
      targetAtM = route.distance_m;
    }

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
    const last = route.geometry[route.geometry.length - 1];
    return bearingDeg(position.lat, position.lon, last.lat, last.lon);
  })();

  const handleRecalculate = useCallback(async () => {
    if (!position) return;
    setBannerDismissed(false);
    setPhotoDismissed(false);
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
      // Silent.
    }
  }, [position, toId, resetOffRoute]);

  const openChat = useCallback(() => {
    router.push({
      pathname: '/chat',
      params: {
        fromPlaceId: fromId ? String(fromId) : '',
        toPlaceId: String(toId),
        currentStepIndex: String(currentStepIndex ?? 0),
        distanceFromStartM: String(
          (route?.distance_m || 0) - distanceRemainingM
        ),
        currentLat: position ? String(position.lat) : '',
        currentLon: position ? String(position.lon) : '',
      },
    });
  }, [
    fromId,
    toId,
    currentStepIndex,
    route?.distance_m,
    distanceRemainingM,
    position,
  ]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: t('walking.title') }} />
        <View style={styles.state}>
          <ActivityIndicator color={COLORS.textMuted} />
        </View>
      </>
    );
  }

  if (error || !route) {
    return (
      <>
        <Stack.Screen options={{ title: t('walking.title') }} />
        <View style={styles.state}>
          <Text style={styles.errorText}>{error || t('common.error')}</Text>
        </View>
      </>
    );
  }

  if (permissionGranted === false) {
    return (
      <>
        <Stack.Screen options={{ title: t('walking.title') }} />
        <View style={styles.state}>
          <Text style={styles.errorText}>{t('walking.permissionNeeded')}</Text>
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

  const showApproachPhoto = approachPhoto && !photoDismissed;

  return (
    <>
      <Stack.Screen
        options={{
          title: t('walking.title'),
          headerBackVisible: false,
          headerRight: () => (
            <View style={styles.headerButtons}>
              <TouchableOpacity
                onPress={openChat}
                style={styles.headerButton}
                accessibilityRole="button"
                accessibilityLabel={t('chat.titleWalk')}
              >
                <MaterialIcons name={ICONS.chat} size={22} color={COLORS.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setReportOpen(true)}
                style={styles.headerButton}
                accessibilityRole="button"
                accessibilityLabel={t('report.reportProblem')}
              >
                <MaterialIcons
                  name={ICONS.report}
                  size={22}
                  color={COLORS.text}
                />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <View style={styles.container}>
        {offRoute && !bannerDismissed ? (
          <OffRouteBanner
            onRecalculate={handleRecalculate}
            onDismiss={() => setBannerDismissed(true)}
          />
        ) : null}

        {wifiSpot ? (
          <WifiBanner spot={wifiSpot} onDismiss={dismissWifi} />
        ) : null}

        <View style={styles.mapWrapper}>
          <RouteMap
            geometry={route.geometry}
            markers={markers}
            userLocation={position}
            style={styles.map}
          />
        </View>

        {showApproachPhoto ? (
          <ApproachPhoto
            photo={approachPhoto}
            destinationName={route.to_name}
            onDismiss={() => setPhotoDismissed(true)}
          />
        ) : null}

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

      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        placeId={Number(toId)}
      />
    </>
  );
}

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
  headerButtons: { flexDirection: 'row' },
  headerButton: {
    padding: 8,
    minWidth: TOUCH.minWidth,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});