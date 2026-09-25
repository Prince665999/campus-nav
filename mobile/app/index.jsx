// Home screen.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { SearchBar } from '@/components/SearchBar';
import { PlaceCard } from '@/components/PlaceCard';
import { CategoryChips } from '@/components/CategoryChips';
import { FeatureCard } from '@/components/FeatureCard';
import { RecentStrip } from '@/components/RecentStrip';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettings } from '@/context/SettingsContext';
import { useStartingPoint } from '@/hooks/useStartingPoint';
import { setRouteRequest } from '@/services/routeRequest';
import {
  extractDestination,
  listPlaces,
  listRecents,
  listFavorites,
} from '@/services/api';
import { t } from '@/i18n';
import { SEARCH_DEBOUNCE_MS, SEARCH_RESULT_LIMIT } from '@/constants/config';
import { COLORS, FONT_SIZE, SPACING } from '@/constants/theme';
import { ICONS } from '@/constants/icons';

export default function HomeScreen() {
  const { settings, loaded } = useSettings();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);
  const [results, setResults] = useState([]);
  const [recents, setRecents] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const navigatingRef = useRef(false);

  const { resolveStart } = useStartingPoint();

  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const isSearching = debouncedQuery.length > 0 || category !== null;

  // First launch: redirect to onboarding.
  useEffect(() => {
    if (loaded && !settings.hasSeenOnboarding) {
      router.replace('/onboarding');
    }
  }, [loaded, settings.hasSeenOnboarding]);

  // Load recents and favorites on mount.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listRecents({ limit: 10 }).catch(() => []),
      listFavorites().catch(() => []),
    ]).then(([r, f]) => {
      if (!cancelled) {
        setRecents(r);
        setFavorites(f);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Search when query or category changes.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const places = await listPlaces({
          q: debouncedQuery || undefined,
          category: category || undefined,
          limit: SEARCH_RESULT_LIMIT,
        });
        if (!cancelled) setResults(places);
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
  }, [debouncedQuery, category]);

  const openPlace = useCallback((place) => {
    router.push(`/place/${place.id}`);
  }, []);

  const openChat = useCallback(() => {
    // No route context — this is the document chat.
    router.push('/chat');
  }, []);

  const openExplore = useCallback(() => {
    router.push('/explore');
  }, []);

  const tryResolveSentence = useCallback(async () => {
    const text = query.trim();
    if (!text || text.length < 5) return;
    if (text.split(/\s+/).length < 3) return;

    // Guard against double-fire.
    if (navigatingRef.current) return;
    navigatingRef.current = true;

    try {
      const extracted = await extractDestination(text);
      if (!extracted.matched) {
        navigatingRef.current = false;
        return;
      }

      const start = await resolveStart({
        destinationPlaceId: extracted.place_id,
      });

      if (!start) {
        navigatingRef.current = false;
        return;
      }

      if (start.lat != null && start.lon != null) {
        setRouteRequest({
          fromLat: start.lat,
          fromLon: start.lon,
          toId: extracted.place_id,
        });
        console.log(
          'index: navigate from GPS',
          start.lat,
          start.lon,
          '→',
          extracted.place_id
        );
      } else if (start.placeId != null) {
        setRouteRequest({
          fromId: start.placeId,
          toId: extracted.place_id,
        });
        console.log(
          'index: navigate from place',
          start.placeId,
          '→',
          extracted.place_id
        );
      } else {
        navigatingRef.current = false;
        return;
      }

      router.push('/route-preview');
    } catch {
      navigatingRef.current = false;
    }
  }, [query, resolveStart]);

  const showSearchResults = isSearching;

  return (
    <View style={styles.container}>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        onSubmit={tryResolveSentence}
        placeholder={t('home.searchPlaceholder')}
        loading={loading && !error && isSearching}
      />

      {showSearchResults ? (
        // Search results replace the Home content.
        <>
          <CategoryChips selected={category} onSelect={setCategory} />
          {error ? (
            <View style={styles.state}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : results.length === 0 && !loading ? (
            <View style={styles.state}>
              <Text style={styles.emptyText}>{t('common.noResults')}</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <PlaceCard place={item} onPress={() => openPlace(item)} />
              )}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
            />
          )}
          {loading && results.length === 0 ? (
            <View style={styles.state}>
              <ActivityIndicator color={COLORS.textMuted} />
            </View>
          ) : null}
        </>
      ) : (
        // Default Home content.
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Two feature cards */}
          <View style={styles.featureRow}>
            <FeatureCard
              icon={ICONS.compass}
              iconColor="#0d9488"
              title={t('home.exploreTitle')}
              description={t('home.exploreDescription')}
              onPress={openExplore}
            />
            <FeatureCard
              icon={ICONS.chat}
              iconColor="#6366f1"
              title={t('home.chatTitle')}
              description={t('home.chatDescription')}
              onPress={openChat}
            />
          </View>

          {/* Recent and favorite places */}
          <RecentStrip
            recents={recents}
            favorites={favorites}
            onPress={openPlace}
          />

          {/* Category chips */}
          <View style={styles.chipsWrapper}>
            <Text style={styles.sectionTitle}>{t('home.categoriesTitle')}</Text>
            <CategoryChips selected={null} onSelect={setCategory} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundSubtle,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
  },
  featureRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.md,
  },
  chipsWrapper: {
    marginTop: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  state: {
    paddingVertical: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
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
  listContent: { paddingBottom: 32 },
});