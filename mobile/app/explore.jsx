// Explore screen.
//
// A visual browse of the whole campus. Featured places up top,
// intent chips below, then a photo grid of buildings and outdoor
// places.
//
// The grid deliberately excludes indoor rooms and doors: they have
// no photos, and they're reachable through the building they're in.
// Tapping a building opens its place-detail, which has an "Inside
// this building" section listing its rooms.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, Stack } from 'expo-router';

import { IntentChips } from '@/components/IntentChips';
import { FeaturedStrip } from '@/components/FeaturedStrip';
import { ExploreGridCard } from '@/components/ExploreGridCard';
import { listBuildings, listPlaces, getPlaceTags } from '@/services/api';
import { t } from '@/i18n';
import { COLORS, FONT_SIZE, SPACING } from '@/constants/theme';

const FEATURED_LIMIT = 5;

export default function ExploreScreen() {
  const [intent, setIntent] = useState(null);
  const [intentCounts, setIntentCounts] = useState(null);

  const [featured, setFeatured] = useState([]);
  const [places, setPlaces] = useState([]);
  const [roomCounts, setRoomCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load featured places and room counts once. These don't change
  // with the filters.
  useEffect(() => {
    let cancelled = false;

    listPlaces({ kind: 'outdoor', limit: 200 })
      .then((data) => {
        if (cancelled) return;
        const landmarks = data.filter((p) => p.is_landmark);
        setFeatured(landmarks.slice(0, FEATURED_LIMIT));
      })
      .catch(() => {
        if (!cancelled) setFeatured([]);
      });

    listBuildings()
      .then((buildings) => {
        if (cancelled) return;
        const counts = {};
        for (const b of buildings) {
          counts[b.id] = b.room_count;
        }
        setRoomCounts(counts);
      })
      .catch(() => {
        if (!cancelled) setRoomCounts({});
      });

    getPlaceTags()
      .then((tags) => {
        if (!cancelled) setIntentCounts(tags.intents || {});
      })
      .catch(() => {
        if (!cancelled) setIntentCounts(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load the grid whenever a filter changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    listPlaces({
      kind: 'outdoor',
      intent: intent || undefined,
      limit: 200,
    })
      .then((data) => {
        if (!cancelled) setPlaces(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || t('common.error'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [intent]);

  const openPlace = useCallback((place) => {
    router.push(`/place/${place.id}`);
  }, []);

  const chooseIntent = useCallback((next) => {
    setIntent(next);
  }, []);

  // Convert the flat list of places into rows of 2 for the grid.
  const gridRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < places.length; i += 2) {
      rows.push(places.slice(i, i + 2));
    }
    return rows;
  }, [places]);

  const hasActiveFilter = intent !== null;

  return (
    <>
      <Stack.Screen options={{ title: t('explore.title') }} />
      <View style={styles.container}>
        {!hasActiveFilter ? (
          <FeaturedStrip places={featured} onPress={openPlace} />
        ) : null}

        <View style={styles.chipsWrapper}>
          <IntentChips
            selected={intent}
            onSelect={chooseIntent}
            counts={intentCounts}
          />
        </View>

        {error ? (
          <View style={styles.state}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : loading && places.length === 0 ? (
          <View style={styles.state}>
            <ActivityIndicator color={COLORS.textMuted} />
          </View>
        ) : places.length === 0 ? (
          <View style={styles.state}>
            <Text style={styles.emptyText}>{t('common.noResults')}</Text>
          </View>
        ) : (
          <FlatList
            data={gridRows}
            keyExtractor={(row, i) => `row-${i}`}
            renderItem={({ item: row }) => (
              <View style={styles.gridRow}>
                {row.map((place) => (
                  <ExploreGridCard
                    key={place.id}
                    place={place}
                    roomCount={roomCounts[place.id]}
                    onPress={() => openPlace(place)}
                  />
                ))}
                {row.length === 1 ? <View style={styles.gridFiller} /> : null}
              </View>
            )}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSubtle },
  chipsWrapper: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
    paddingBottom: SPACING.sm,
  },
  gridRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  gridFiller: { flex: 1 },
  listContent: { paddingTop: SPACING.md, paddingBottom: SPACING.xl },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
  },
});