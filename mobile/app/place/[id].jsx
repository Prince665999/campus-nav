// Place detail screen.
//
// Reached by tapping a search result. Shows everything the API knows
// about one place, and offers a "Take me there" button that goes to
// route preview.
//
// The route needs a "from" too. For now, we use the first place in
// the database as a stand-in starting point — a real "from" arrives
// in Phase 6 with GPS. The user never sees this; the preview just
// uses it to compute a route.

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

import { getPlace, listPlaces } from '@/services/api';
import { t } from '@/i18n';

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams();
  const placeId = Number(id);

  const [place, setPlace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getPlace(placeId);
        if (!cancelled) setPlace(data);
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
  }, [placeId]);

  const takeMeThere = useCallback(async () => {
    if (!place) return;
    // Find a temporary "from" place — the first place that isn't this
    // one. Replaced with real GPS in Phase 6.
    try {
      const others = await listPlaces({ limit: 5 });
      const from = others.find((p) => p.id !== place.id) || others[0];
      if (!from) {
        setError('No other places to route from.');
        return;
      }
      router.push({
        pathname: '/route-preview',
        params: {
          fromId: String(from.id),
          toId: String(place.id),
        },
      });
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  }, [place]);

  if (loading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color="#6b7280" />
      </View>
    );
  }

  if (error || !place) {
    return (
      <View style={styles.state}>
        <Text style={styles.errorText}>{error || t('common.error')}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: place.name }} />
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.name}>{place.name}</Text>
          {place.name_sw ? (
            <Text style={styles.nameSw}>{place.name_sw}</Text>
          ) : null}
          {place.category ? (
            <Text style={styles.category}>{prettifyCategory(place.category)}</Text>
          ) : null}
        </View>

        <Section title="Description">
          <Text style={styles.body}>
            {place.description || t('place.noDescription')}
          </Text>
        </Section>

        {place.opening_hours ? (
          <Section title="Opening hours">
            <Text style={styles.body}>{place.opening_hours}</Text>
          </Section>
        ) : null}

        {place.wheelchair ? (
          <Section title="Accessibility">
            <Text style={styles.body}>
              {place.wheelchair === 'yes'
                ? t('place.wheelchairAccessible')
                : t('place.notAccessible')}
            </Text>
          </Section>
        ) : null}

        {place.has_wifi ? (
          <Section title="Wi-Fi">
            <Text style={styles.body}>
              {t('place.hasWifi')}
              {place.wifi_ssid ? `: ${place.wifi_ssid}` : ''}
            </Text>
          </Section>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={takeMeThere}
            accessibilityRole="button"
            accessibilityLabel={t('place.takeMeThere')}
          >
            <Text style={styles.primaryButtonText}>
              {t('place.takeMeThere')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function prettifyCategory(category) {
  const value = category.includes('=') ? category.split('=')[1] : category;
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  state: {
    flex: 1,
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  errorText: { color: '#dc2626', fontSize: 15, textAlign: 'center', padding: 20 },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  name: { fontSize: 24, fontWeight: '700', color: '#111827' },
  nameSw: { fontSize: 16, color: '#6b7280', marginTop: 4 },
  category: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
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
    marginBottom: 8,
  },
  body: { fontSize: 15, color: '#374151', lineHeight: 22 },
  actions: { padding: 20 },
  primaryButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});