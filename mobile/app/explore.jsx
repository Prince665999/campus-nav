// Explore screen.
//
// A visual browse of the whole campus. Featured places up top,
// category and intent chips below, then a photo grid.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, Stack } from 'expo-router';

import { CategoryChips } from '@/components/CategoryChips';
import { IntentChips } from '@/components/IntentChips';
import { FeaturedStrip } from '@/components/FeaturedStrip';
import { ExploreGridCard } from '@/components/ExploreGridCard';
import { listPlaces } from '@/services/api';
import { t } from '@/i18n';
import { COLORS, FONT_SIZE, SPACING } from '@/constants/theme';

// How many featured places to show. The most prominent ones.
const FEATURED_LIMIT = 5;

export default function ExploreScreen() {
  const [category, setCategory] = useState(null);
  const [intent, setIntent] = useState(null);

  const [featured, setFeatured] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load featured places once. These don't change with the filters.
  useEffect(() => {
    let cancelled = false;
    listPlaces({ limit: 200 })
      .then((data) => {
        if (cancelled) return;
        const landmarks = data.filter((p) => p.is_landmark);
        setFeatured(landmarks.slice(0, FEATURED_LIMIT));
      })
      .catch(() => {
        if (!cancelled) setFeatured([]);
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
      category: category || undefined,
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
  }, [category, intent]);

  const openPlace = useCallback((place) => {
    router.push(`/place/${place.id}`);
  }, []);

  // When the admin picks a category, clear the intent. Only one
  // filter can be active at a time — the alternative is confusing.
  const chooseCategory = useCallback((next) => {
    setCategory(next);
    if (next) setIntent(null);
  }, []);

  const chooseIntent = useCallback((next) => {
    setIntent(next);
    if (next) setCategory(null);
  }, []);

  // Convert the flat list of places into rows of 2 for the grid.
  const gridRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < places.length; i += 2) {
      rows.push(places.slice(i, i + 2));
    }
    return rows;
  }, [places]);

  const hasActiveFilter = category !== null || intent !== null;

  return (
    <>
      <Stack.Screen options={{ title: t('explore.title') }} />
      <View style={styles.container}>
        {/* Featured strip. Hidden when a filter is active, so the
            whole screen focuses on the results. */}
        {!hasActiveFilter ? (
          <FeaturedStrip places={featured} onPress={openPlace} />
        ) : null}

        <View style={styles.chipsWrapper}>
          <CategoryChips selected={category} onSelect={chooseCategory} />
          <IntentChips selected={intent} onSelect={chooseIntent} />
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
                    onPress={() => openPlace(place)}
                  />
                ))}
                {/* If the row has only one place, fill the other slot
                    so the layout stays even. */}
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