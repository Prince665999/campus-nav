// Route preview screen.
//
// Shows the route on a map, the summary line, the turn-by-turn steps,
// and the narration. "Start walking" navigates to the walking screen.

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

import { RouteMap } from '@/components/MapView';
import { RouteSummary } from '@/components/RouteSummary';
import { computeRoute, narrateRoute } from '@/services/api';
import { t } from '@/i18n';
import { estimateWalkingSeconds, formatDistance } from '@/utils/format';

export default function RoutePreviewScreen() {
  const { fromId, toId } = useLocalSearchParams();
  const fromPlaceId = Number(fromId);
  const toPlaceId = Number(toId);

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
        const data = await computeRoute({ fromPlaceId, toPlaceId });
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
  }, [fromPlaceId, toPlaceId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await narrateRoute({ fromPlaceId, toPlaceId, live: false });
        if (!cancelled) setNarration(data);
      } catch {
        if (!cancelled) setNarration(null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [fromPlaceId, toPlaceId]);

  const startWalking = useCallback(() => {
    if (!route) return;
    router.push({
      pathname: '/walking',
      params: {
        fromId: String(fromPlaceId),
        toId: String(toPlaceId),
        routeJson: JSON.stringify(route),
      },
    });
  }, [route, fromPlaceId, toPlaceId]);

  if (loading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color="#6b7280" />
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
      <Stack.Screen options={{ title: 'Route' }} />
      <View style={styles.container}>
        <RouteMap
          geometry={route.geometry}
          markers={markers}
          style={styles.map}
        />

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
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

        <View style={styles.footer}>
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
  container: { flex: 1, backgroundColor: '#ffffff' },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  errorText: { color: '#dc2626', fontSize: 15, textAlign: 'center', padding: 20 },
  map: { height: 280 },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 32 },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sectionTitle: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  step: { flexDirection: 'row', marginBottom: 12 },
  stepDistance: {
    width: 60,
    color: '#9ca3af',
    fontSize: 13,
    paddingTop: 2,
  },
  stepText: { flex: 1, color: '#111827', fontSize: 15, lineHeight: 22 },
  narrationText: { color: '#374151', fontSize: 16, lineHeight: 24 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    backgroundColor: '#ffffff',
  },
  primaryButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});