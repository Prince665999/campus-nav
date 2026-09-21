// Place detail screen.

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

import {
  addFavorite,
  getPlace,
  isFavorite,
  listMediaForPlace,
  listPlaces,
  removeFavorite,
} from '@/services/api';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { ReportSheet } from '@/components/ReportSheet';
import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams();
  const placeId = Number(id);

  const [place, setPlace] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [placeData, photoData, favFlag] = await Promise.all([
          getPlace(placeId),
          listMediaForPlace(placeId).catch(() => []),
          isFavorite(placeId).catch(() => false),
        ]);
        if (!cancelled) {
          setPlace(placeData);
          setPhotos(photoData);
          setFavorited(favFlag);
        }
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

  const toggleFavorite = useCallback(async () => {
    const next = !favorited;
    setFavorited(next); // optimistic update
    try {
      if (next) {
        await addFavorite(placeId);
      } else {
        await removeFavorite(placeId);
      }
    } catch {
      // Revert on failure.
      setFavorited(!next);
    }
  }, [favorited, placeId]);

  const takeMeThere = useCallback(async () => {
    if (!place) return;
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
        <ActivityIndicator color={COLORS.textMuted} />
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
      <Stack.Screen
        options={{
          title: place.name,
          headerRight: () => (
            <TouchableOpacity
              onPress={toggleFavorite}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel={
                favorited ? t('place.removeFavorite') : t('place.addFavorite')
              }
            >
              <Text style={[styles.star, favorited && styles.starActive]}>
                {favorited ? '★' : '☆'}
              </Text>
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView style={styles.container}>
        <PhotoCarousel photos={photos} />

        <View style={styles.header}>
          <Text style={styles.name}>{place.name}</Text>
          {place.name_sw ? (
            <Text style={styles.nameSw}>{place.name_sw}</Text>
          ) : null}
          {place.category ? (
            <Text style={styles.category}>
              {prettifyCategory(place.category)}
            </Text>
          ) : null}
        </View>

        <Section title={t('place.description')}>
          <Text style={styles.body}>
            {place.description || t('place.noDescription')}
          </Text>
        </Section>

        {place.opening_hours ? (
          <Section title={t('place.openingHours')}>
            <Text style={styles.body}>{place.opening_hours}</Text>
          </Section>
        ) : null}

        {place.wheelchair ? (
          <Section title={t('place.accessibility')}>
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

          <TouchableOpacity
            style={styles.reportLink}
            onPress={() => setReportOpen(true)}
            accessibilityRole="button"
          >
            <Text style={styles.reportLinkText}>{t('report.reportProblem')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        placeId={place.id}
      />
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
  container: { flex: 1, backgroundColor: COLORS.background },
  state: {
    flex: 1,
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundSubtle,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
    padding: SPACING.lg,
  },
  headerButton: { padding: 6 },
  star: { fontSize: 24, color: COLORS.textFaint },
  starActive: { color: COLORS.warning },
  header: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  name: { fontSize: FONT_SIZE.hero, fontWeight: '700', color: COLORS.text },
  nameSw: { fontSize: 16, color: COLORS.textMuted, marginTop: 4 },
  category: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textFaint,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
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
    marginBottom: 8,
  },
  body: { fontSize: FONT_SIZE.body, color: '#374151', lineHeight: 22 },
  actions: { padding: SPACING.lg },
  primaryButton: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  reportLink: {
    marginTop: SPACING.md,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  reportLinkText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.body,
    fontWeight: '500',
  },
});