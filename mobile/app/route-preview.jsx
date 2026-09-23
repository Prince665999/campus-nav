// Route preview screen.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/MapView';
import { RouteSummary } from '@/components/RouteSummary';
import { computeRoute, narrateRoute } from '@/services/api';
import { useSettings } from '@/context/SettingsContext';
import { t } from '@/i18n';
import { estimateWalkingSeconds, formatDistance } from '@/utils/format';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';

export default function RoutePreviewScreen() {
  const { fromId, toId, fromLat, fromLon } = useLocalSearchParams();

  // Either an ID or coordinates, depending on how the student got
  // here. The route service accepts both.
  const fromPlaceId = fromId ? Number(fromId) : null;
  const toPlaceId = Number(toId);
  const fromLatNum = fromLat ? Number(fromLat) : null;
  const fromLonNum = fromLon ? Number(fromLon) : null;

  const insets = useSafeAreaInsets();
  const { settings } = useSettings();

  const [route, setRoute] = useState(null);
  const [narration, setNarration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await computeRoute({
          fromPlaceId,
          toPlaceId,
          fromLat: fromLatNum,
          fromLon: fromLonNum,
        });
        if (!cancelled) setRoute(data);
      } catch (err) {
        if (!cancelled) setError(err.message || t('common.error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [fromPlaceId, toPlaceId, fromLatNum, fromLonNum]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await narrateRoute({
          fromPlaceId,
          toPlaceId,
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
  }, [fromPlaceId, toPlaceId, settings.language]);

  const startWalking = useCallback(() => {
    if (!route) return;
    // Pass the route along. The walking screen uses the from/to
    // params for recalculation and the routeJson for the geometry.
    const params = {
      toId: String(toPlaceId),
      routeJson: JSON.stringify(route),
    };
    if (fromPlaceId != null) {
      params.fromId = String(fromPlaceId);
    } else if (fromLatNum != null && fromLonNum != null) {
      params.fromLat = String(fromLatNum);
      params.fromLon = String(fromLonNum);
    }
    router.push({
      pathname: '/walking',
      params,
    });
  }, [route, fromPlaceId, toPlaceId, fromLatNum, fromLonNum]);

  if (loading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={COLORS.textMuted} />
      </View>
    );
  }

  if (error || !route) {
    return (
      <View style={styles.state}>
        <Text style={styles.errorText}>{error || t('route.noRoute')}</Text>
      </View>
    );
  }

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
            <Text style={styles.primaryButtonText}>{t('route.startButton')}</Text>
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
  },
  errorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
    padding: 20,
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
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});