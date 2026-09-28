// Home screen.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link, router, Stack } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { SearchBar } from '@/components/SearchBar';
import { PlaceCard } from '@/components/PlaceCard';
import { CategoryChips } from '@/components/CategoryChips';
import { FeatureCard } from '@/components/FeatureCard';
import { RecentStrip } from '@/components/RecentStrip';
import { NextClassBanner } from '@/components/NextClassBanner';
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
import { getWeek } from '@/services/timetable';
import { t } from '@/i18n';
import { SEARCH_DEBOUNCE_MS, SEARCH_RESULT_LIMIT } from '@/constants/config';
import { COLORS, FONT_SIZE, SPACING, TOUCH } from '@/constants/theme';
import { ICONS } from '@/constants/icons';

// How close a class has to be to appear on the banner. 30 minutes.
const BANNER_WINDOW_S = 30 * 60;

// How often to re-check the schedule while Home is foregrounded.
// Every 60 seconds. The check itself is local — no network.
const BANNER_TICK_MS = 60 * 1000;

export default function HomeScreen() {
  const { settings, loaded } = useSettings();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);
  const [results, setResults] = useState([]);
  const [recents, setRecents] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Timetable-related state.
  const [weekEntries, setWeekEntries] = useState([]);
  const [nextClass, setNextClass] = useState(null);
  const [, setTick] = useState(0); // forces recompute of nextClass every minute

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

  // Load the timetable week when the selection changes.
  useEffect(() => {
    const programYearId = settings.programYearId;
    if (!programYearId) {
      setWeekEntries([]);
      setNextClass(null);
      return;
    }
    let cancelled = false;
    getWeek(programYearId)
      .then((data) => {
        if (!cancelled) setWeekEntries(data.entries || []);
      })
      .catch(() => {
        if (!cancelled) setWeekEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [settings.programYearId]);

  // Compute the next class. Recomputes when the week changes, and
  // every 60 seconds otherwise (so the countdown stays fresh).
  useEffect(() => {
    function computeNext() {
      if (!weekEntries.length) {
        setNextClass(null);
        return;
      }
      const now = new Date();
      const todayDow = (now.getDay() + 6) % 7; // 0 = Monday

      let bestEntry = null;
      let bestDelta = null;

      for (const entry of weekEntries) {
        // Days forward from today to this entry's day.
        const daysAhead = (entry.day_of_week - todayDow + 7) % 7;

        const [hh, mm] = entry.start_time.split(':').map(Number);
        const start = new Date(now);
        start.setDate(start.getDate() + daysAhead);
        start.setHours(hh, mm, 0, 0);

        const deltaSec = (start - now) / 1000;

        // Skip already-started classes and classes beyond the window.
        if (deltaSec < 0) continue;
        if (deltaSec > BANNER_WINDOW_S) continue;

        if (bestDelta === null || deltaSec < bestDelta) {
          bestDelta = deltaSec;
          bestEntry = entry;
        }
      }

      if (bestEntry) {
        setNextClass({ entry: bestEntry, startsInSeconds: bestDelta });
      } else {
        setNextClass(null);
      }
    }

    computeNext();
    const id = setInterval(() => {
      computeNext();
      setTick((n) => n + 1);
    }, BANNER_TICK_MS);
    return () => clearInterval(id);
  }, [weekEntries]);

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
    router.push('/chat');
  }, []);

  const openExplore = useCallback(() => {
    router.push('/explore');
  }, []);

  const openTimetable = useCallback(() => {
    router.push('/timetable');
  }, []);

  // When the banner's "Take me there" is tapped, start a route to
  // the venue. Same flow as the place detail screen.
  const navigateToNextClass = useCallback(
    async (entry) => {
      if (entry.venue_place_id == null) return;
      if (navigatingRef.current) return;
      navigatingRef.current = true;

      try {
        const start = await resolveStart({
          destinationPlaceId: entry.venue_place_id,
        });
        if (!start) {
          navigatingRef.current = false;
          return;
        }

        if (start.lat != null && start.lon != null) {
          setRouteRequest({
            fromLat: start.lat,
            fromLon: start.lon,
            fromAccuracyM: start.accuracyM,
            toId: entry.venue_place_id,
          });
        } else if (start.placeId != null) {
          setRouteRequest({
            fromId: start.placeId,
            toId: entry.venue_place_id,
          });
        } else {
          navigatingRef.current = false;
          return;
        }

        router.push('/route-preview');
      } catch {
        navigatingRef.current = false;
      }
    },
    [resolveStart]
  );

  const tryResolveSentence = useCallback(async () => {
    const text = query.trim();
    if (!text || text.length < 5) return;
    if (text.split(/\s+/).length < 3) return;

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
      } else if (start.placeId != null) {
        setRouteRequest({
          fromId: start.placeId,
          toId: extracted.place_id,
        });
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

  // The header-right area. Two icons side by side: timetable and
  // settings. Order: timetable first (more frequently used), then
  // settings.
  const headerRight = useCallback(
    () => (
      <View style={styles.headerButtons}>
        <TouchableOpacity
          onPress={openTimetable}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel={t('timetable.title')}
        >
          <MaterialIcons
            name="calendar-today"
            size={22}
            color={COLORS.text}
          />
        </TouchableOpacity>
        <Link href="/settings" asChild>
          <TouchableOpacity
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <MaterialIcons
              name={ICONS.settings}
              size={22}
              color={COLORS.text}
            />
          </TouchableOpacity>
        </Link>
      </View>
    ),
    [openTimetable]
  );

  return (
    <>
      <Stack.Screen options={{ headerRight }} />
      <View style={styles.container}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={tryResolveSentence}
          placeholder={t('home.searchPlaceholder')}
          loading={loading && !error && isSearching}
        />

        {/* The next-class banner. Only shows when there's a class
            within 90 minutes. */}
        {nextClass ? (
          <NextClassBanner
            entry={nextClass.entry}
            startsInSeconds={nextClass.startsInSeconds}
            onNavigate={navigateToNextClass}
            onViewTimetable={openTimetable}
          />
        ) : null}

        {showSearchResults ? (
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
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
          >
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

            <RecentStrip
              recents={recents}
              favorites={favorites}
              onPress={openPlace}
            />

            <View style={styles.chipsWrapper}>
              <Text style={styles.sectionTitle}>{t('home.categoriesTitle')}</Text>
              <CategoryChips selected={null} onSelect={setCategory} />
            </View>
          </ScrollView>
        )}
      </View>
    </>
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
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    paddingHorizontal: 10,
    minWidth: TOUCH.minWidth,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
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