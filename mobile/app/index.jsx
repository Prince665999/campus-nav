// Home screen.
//
// Two states: searching (query or category selected) shows results,
// not searching shows recents and favorites. On first launch,
// redirects to onboarding.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { SearchBar } from '@/components/SearchBar';
import { PlaceCard } from '@/components/PlaceCard';
import { CategoryChips } from '@/components/CategoryChips';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettings } from '@/context/SettingsContext';
import {
  extractDestination,
  listPlaces,
  listRecents,
  listFavorites,
} from '@/services/api';
import { t } from '@/i18n';
import { SEARCH_DEBOUNCE_MS, SEARCH_RESULT_LIMIT } from '@/constants/config';
import { COLORS, FONT_SIZE, SPACING } from '@/constants/theme';

export default function HomeScreen() {
  const { settings } = useSettings();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);
  const [results, setResults] = useState([]);
  const [recents, setRecents] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const isSearching = debouncedQuery.length > 0 || category !== null;

  // First launch: redirect to onboarding.
  useEffect(() => {
    if (settings.loaded && !settings.hasSeenOnboarding) {
      router.replace('/onboarding');
    }
  }, [settings.loaded, settings.hasSeenOnboarding]);

  // Load recents and favorites once on mount.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listRecents({ limit: 5 }).catch(() => []),
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

  // Sentence-to-destination. Fires when the student presses the
  // keyboard's search key with more than a couple of words.
  const tryResolveSentence = useCallback(async () => {
    const text = query.trim();
    if (!text || text.length < 5) return;
    if (text.split(/\s+/).length < 3) return;

    try {
      const extracted = await extractDestination(text);
      if (extracted.matched) {
        const others = await listPlaces({ limit: 5 });
        const from = others.find((p) => p.id !== extracted.place_id) || others[0];
        if (!from) return;
        router.push({
          pathname: '/route-preview',
          params: {
            fromId: String(from.id),
            toId: String(extracted.place_id),
          },
        });
      }
    } catch {
      // Silent. The student can still tap a search result below.
    }
  }, [query]);

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

      <CategoryChips selected={category} onSelect={setCategory} />

      {error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : showSearchResults ? (
        results.length === 0 && !loading ? (
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
        )
      ) : (
        <FlatList
          data={[{ key: 'sections' }]}
          keyExtractor={(item) => item.key}
          renderItem={() => (
            <>
              {recents.length > 0 ? (
                <Section title={t('home.recentTitle')}>
                  {recents.map((place) => (
                    <PlaceCard
                      key={`recent-${place.place_id}`}
                      place={{
                        id: place.place_id,
                        name: place.name,
                        name_sw: place.name_sw,
                        category: place.category,
                        location: place.location,
                      }}
                      onPress={() => openPlace({ id: place.place_id })}
                    />
                  ))}
                </Section>
              ) : null}

              {favorites.length > 0 ? (
                <Section title={t('home.favoritesTitle')}>
                  {favorites.map((place) => (
                    <PlaceCard
                      key={`fav-${place.place_id}`}
                      place={{
                        id: place.place_id,
                        name: place.name,
                        name_sw: place.name_sw,
                        category: place.category,
                        location: place.location,
                      }}
                      onPress={() => openPlace({ id: place.place_id })}
                      isFavorite
                    />
                  ))}
                </Section>
              ) : null}

              {recents.length === 0 && favorites.length === 0 ? (
                <View style={styles.state}>
                  <Text style={styles.emptyText}>{t('home.emptyHint')}</Text>
                </View>
              ) : null}
            </>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

      {loading && results.length === 0 && isSearching ? (
        <View style={styles.state}>
          <ActivityIndicator color={COLORS.textMuted} />
        </View>
      ) : null}
    </View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundSubtle,
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
  section: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.background,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
});