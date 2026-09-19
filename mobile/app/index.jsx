// Home screen. The app's landing page and search interface.

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
import { listPlaces } from '@/services/api';
import { t } from '@/i18n';
import { SEARCH_DEBOUNCE_MS, SEARCH_RESULT_LIMIT } from '@/constants/config';

export default function HomeScreen() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);

  // Fetch places whenever the debounced query or category changes.
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

  return (
    <View style={styles.container}>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('home.searchPlaceholder')}
        loading={loading && !error}
      />

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
          <ActivityIndicator color="#6b7280" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  state: {
    paddingVertical: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 15,
    textAlign: 'center',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 15,
  },
  listContent: {
    paddingBottom: 32,
  },
});