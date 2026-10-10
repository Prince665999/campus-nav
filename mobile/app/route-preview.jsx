// Route preview screen.
//
// Loads a route from the pending request, shows the summary and
// steps, and starts Walking Mode.
//
// Recovery path: if the backend rejects the GPS fix with
// `LocationTooFarError`, we show a single button — "Pick where you
// are" — that opens the door picker. Picking a door replaces the
// request's `from` with the door's place id and re-runs the route.
// The student never leaves this screen.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/MapView';
import { RouteSummary } from '@/components/RouteSummary';
import { DoorPickerSheet } from '@/components/DoorPickerSheet';
import { computeRoute, narrateRoute } from '@/services/api';
import { takeRouteRequest, setRouteRequest } from '@/services/routeRequest';
import { useSettings } from '@/context/SettingsContext';
import { t } from '@/i18n';
import { estimateWalkingSeconds, formatDistance } from '@/utils/format';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';

export default function RoutePreviewScreen() {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();

  // The current route request. It starts as whatever was stashed by
  // the previous screen, and can be replaced here when the student
  // picks a door after a LocationTooFarError.
  const [request, setRequest] = useState(() => takeRouteRequest());

  const [route, setRoute] = useState(null);
  const [narration, setNarration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [doorPickerOpen, setDoorPickerOpen] = useState(false);

  const needsIndoorPick =
    error != null && error.code === 'LocationTooFarError';

  // Load the route whenever the request changes.
  useEffect(() => {
    if (!request) {
      setError({
        message: 'This route has no starting point. Go back and try again.',
        code: null,
      });
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setRoute(null);

      try {
        const data = await computeRoute({
          fromPlaceId: request.fromId,
          toPlaceId: request.toId,
          fromLat: request.fromLat,
          fromLon: request.fromLon,
          fromAccuracyM: request.fromAccuracyM,
        });
        if (!cancelled) setRoute(data);
      } catch (err) {
        if (!cancelled) {
          setError({
            message:
              err.code === 'LocationTooFarError'
                ? "We couldn't confidently place your location."
                : err.message || t('common.error'),
            code: err.code || null,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [request]);

  // Load narration whenever the route changes.
  useEffect(() => {
    if (!route || !request) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await narrateRoute({
          fromPlaceId: request.fromId,
          toPlaceId: request.toId,
          fromLat: request.fromLat,
          fromLon: request.fromLon,
          lang: settings.language,
          live: false,
        });
        if (!cancelled) setNarration(data);
      } catch {
        if (!cancelled) setNarration(null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [route, request, settings.language]);

  const startWalking = useCallback(() => {
    if (!route || !request) return;

    setRouteRequest({
      fromLat: request.fromLat,
      fromLon: request.fromLon,
      fromId: request.fromId,
      fromAccuracyM: request.fromAccuracyM,
      toId: request.toId,
    });

    router.push({
      pathname: '/walking',
      params: { routeJson: JSON.stringify(route) },
    });
  }, [route, request]);

  const handleDoorPicked = useCallback(
    (door) => {
      setDoorPickerOpen(false);
      // Replace the request's from side with the picked door. The
      // failed GPS fix is dropped.
      setRequest({
        fromId: door.id,
        fromLat: null,
        fromLon: null,
        fromAccuracyM: null,
        toId: request?.toId ?? null,
      });
    },
    [request]
  );

  // ---- Loading ----
  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: t('route.title') }} />
        <View style={styles.state}>
          <ActivityIndicator color={COLORS.textMuted} />
        </View>
      </>
    );
  }

  // ---- Recovery: the backend couldn't place the GPS fix ----
  if (needsIndoorPick) {
    return (
      <>
        <Stack.Screen options={{ title: t('route.title') }} />
        <View style={styles.state}>
          <Text style={styles.stateTitle}>
            {t('route.locationTooFarTitle')}
          </Text>
          <Text style={styles.stateBody}>
            {t('route.locationTooFarBody')}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setDoorPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('route.locationTooFarButton')}
          >
            <Text style={styles.primaryButtonText}>
              {t('route.locationTooFarButton')}
            </Text>
          </TouchableOpacity>
        </View>

        <DoorPickerSheet
          visible={doorPickerOpen}
          buildingName={null}
          onPick={handleDoorPicked}
          onCancel={() => setDoorPickerOpen(false)}
        />
      </>
    );
  }

  // ---- Any other error ----
  if (error || !route) {
    return (
      <>
        <Stack.Screen options={{ title: t('route.title') }} />
        <View style={styles.state}>
          <Text style={styles.errorText}>
            {error?.message || t('route.noRoute')}
          </Text>
        </View>
      </>
    );
  }

  // ---- Normal preview ----
  const seconds = estimateWalkingSeconds(route.distance_m);

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
      <Stack.Screen options={{ title: t('route.title') }} />
      <View style={styles.container}>
        <RouteMap
          geometry={route.geometry}
          markers={markers}
          style={styles.map}
        />

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
        >
          <RouteSummary
            fromName={route.from_name}
            toName={route.to_name}
            distanceM={route.distance_m}
            durationSeconds={seconds}
          />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('route.turnByTurn')}</Text>
            {route.steps.map((step, i) => (
              <View key={i} style={styles.step}>
                <Text style={styles.stepDistance}>
                  {formatDistance(step.at_m)}
                </Text>
                <Text style={styles.stepText}>{step.instruction}</Text>
              </View>
            ))}
          </View>

          {narration && narration.text ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('route.narration')}</Text>
              <Text style={styles.narrationText}>{narration.text}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={startWalking}
            accessibilityRole="button"
            accessibilityLabel={t('route.startButton')}
          >
            <Text style={styles.primaryButtonText}>
              {t('route.startButton')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundSubtle,
    padding: SPACING.xl,
  },
  stateTitle: {
    fontSize: FONT_SIZE.large,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  stateBody: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
    padding: SPACING.lg,
  },
  map: { height: 280 },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 32 },
  section: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  step: { flexDirection: 'row', marginBottom: 12 },
  stepDistance: {
    width: 60,
    color: COLORS.textFaint,
    fontSize: 13,
    paddingTop: 2,
  },
  stepText: { flex: 1, color: COLORS.text, fontSize: 15, lineHeight: 22 },
  narrationText: { color: '#374151', fontSize: 16, lineHeight: 24 },
  footer: {
    paddingTop: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
    backgroundColor: COLORS.background,
  },
  primaryButton: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    paddingHorizontal: SPACING.xl,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});