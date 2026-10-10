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
import { FromChip } from '@/components/FromChip';
import { StartingPointSheet } from '@/components/StartingPointSheet';
import { AreYouInsideSheet } from '@/components/AreYouInsideSheet';
import { DoorPickerSheet } from '@/components/DoorPickerSheet';
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

const BANNER_WINDOW_S = 30 * 60;
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

  const [weekEntries, setWeekEntries] = useState([]);
  const [nextClass, setNextClass] = useState(null);
  const [, setTick] = useState(0);

  const [startSheetOpen, setStartSheetOpen] = useState(false);
  const [startSheetMode, setStartSheetMode] = useState('choose');
  const [doorPickerOpen, setDoorPickerOpen] = useState(false);
  const [pendingDestination, setPendingDestination] = useState(null);

  const navigatingRef = useRef(false);

  const {
    state: startState,
    start,
    nearbyPlaces,
    suspiciousBuilding,
    resolveStart,
    choosePlace,
    startDoorPick,
    confirmOutside,
    loadOutdoorPlaces,
    forgetStart,
    reset: resetStart,
  } = useStartingPoint();

  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const isSearching = debouncedQuery.length > 0 || category !== null;

  // First launch: redirect to onboarding.
  useEffect(() => {
    if (loaded && !settings.hasSeenOnboarding) {
      router.replace('/onboarding');
    }
  }, [loaded, settings.hasSeenOnboarding]);

  // Load recents and favorites.
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

  // Load timetable week when the selection changes.
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

  // Compute the next class.
  useEffect(() => {
    function computeNext() {
      if (!weekEntries.length) {
        setNextClass(null);
        return;
      }
      const now = new Date();
      const todayDow = (now.getDay() + 6) % 7;
      let bestEntry = null;
      let bestDelta = null;

      for (const entry of weekEntries) {
        const daysAhead = (entry.day_of_week - todayDow + 7) % 7;
        const [hh, mm] = entry.start_time.split(':').map(Number);
        const startTime = new Date(now);
        startTime.setDate(startTime.getDate() + daysAhead);
        startTime.setHours(hh, mm, 0, 0);
        const deltaSec = (startTime - now) / 1000;
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

  // Search.
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

  // Perform a route from a resolved start to a destination.
  const beginRoute = useCallback((resolvedStart, destId) => {
    if (!resolvedStart && !destId) {
      return false;
    }
    if (resolvedStart.lat != null && resolvedStart.lon != null) {
      setRouteRequest({
        fromLat: resolvedStart.lat,
        fromLon: resolvedStart.lon,
        fromAccuracyM: resolvedStart.accuracyM,
        toId: destId,
      });
    } else if (resolvedStart.placeId != null) {
      setRouteRequest({
        fromId: resolvedStart.placeId,
        toId: destId,
      });
    } else {
      return false;
    }
    router.push('/route-preview');
    return true;
  }, []);

  // Take me there — from a place detail or from anywhere.
  // On Home, this is only called via the sentence search or the
  // next-class banner. Destination is a place id.
  const startRouteToDestination = useCallback(
    async (destId) => {
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      setPendingDestination(destId);

      try {
        const result = await resolveStart({ destinationPlaceId: destId });

        switch (result.status) {
          case 'ok':
          case 'ok_place':
            beginRoute(result.start, destId);
            navigatingRef.current = false;
            setPendingDestination(null);
            return;

          case 'ask':
            // AreYouInsideSheet is driven by startState === 'askIndoor'.
            // Keep navigatingRef true and pendingDestination set —
            // the sheet's handlers will finish the flow.
            return;

          case 'pick':
            setStartSheetMode('place-list');
            setStartSheetOpen(true);
            return;

          case 'denied':
            if (result.reason === 'permission_denied') {
              setError(t('start.permissionDenied'));
            } else {
              setError(t('common.error'));
            }
            navigatingRef.current = false;
            setPendingDestination(null);
            return;

          default:
            navigatingRef.current = false;
            setPendingDestination(null);
            return;
        }
      } catch (err) {
        setError(err.message || t('common.error'));
        navigatingRef.current = false;
        setPendingDestination(null);
      }
    },
    [resolveStart, beginRoute]
  );

  // Banner's Take me there.
  const navigateToNextClass = useCallback(
    async (entry) => {
      if (entry.venue_place_id == null) return;
      await startRouteToDestination(entry.venue_place_id);
    },
    [startRouteToDestination]
  );

  // Sentence search: "take me to the library".
  const tryResolveSentence = useCallback(async () => {
    const text = query.trim();
    if (!text || text.length < 5) return;
    if (text.split(/\s+/).length < 3) return;
    if (navigatingRef.current) return;

    try {
      const extracted = await extractDestination(text);
      if (!extracted.matched) return;
      await startRouteToDestination(extracted.place_id);
    } catch {
      // Silent.
    }
  }, [query, startRouteToDestination]);

  // Chip handlers.
  const openStartSheet = useCallback(() => {
    setStartSheetMode('choose');
    setStartSheetOpen(true);
    resetStart();
  }, [resetStart]);

  const handleChoosePlace = useCallback(
    (place) => {
      if (place == null) {
        // Student picked "pick a starting place" — switch to the list.
        setStartSheetMode('place-list');
        if (nearbyPlaces.length === 0) {
          loadOutdoorPlaces({ excludePlaceId: pendingDestination });
        }
        return;
      }
      choosePlace(place);
      setStartSheetOpen(false);
      setStartSheetMode('choose');
    },
    [choosePlace, nearbyPlaces.length, loadOutdoorPlaces, pendingDestination]
  );

  const handleUseGps = useCallback(() => {
    setStartSheetOpen(false);
    // Forget any previously chosen start so the next route does a
    // fresh GPS read.
    forgetStart();
  }, [forgetStart]);

  const handleImInside = useCallback(() => {
    setStartSheetOpen(false);
    setDoorPickerOpen(true);
  }, []);

  const handleDoorPicked = useCallback(
    (door) => {
      setDoorPickerOpen(false);
      choosePlace(door);
      // If there's a pending destination (auto-trigger flow), route
      // to it now.
      if (pendingDestination != null) {
        beginRoute(
          {
            placeId: door.id,
            placeName: door.name,
            buildingName: door.building_name || null,
            level: door.level || null,
          },
          pendingDestination
        );
        navigatingRef.current = false;
        setPendingDestination(null);
      }
    },
    [choosePlace, pendingDestination, beginRoute]
  );

  // Auto-trigger — "Are you inside?" — yes/no.
  const handleInsideYes = useCallback(() => {
    setDoorPickerOpen(true);
  }, []);

  const handleInsideNo = useCallback(() => {
    const dest = pendingDestination;
    if (dest == null) {
      navigatingRef.current = false;
      resetStart();
      return;
    }
    const resolved = confirmOutside();
    if (resolved) {
      beginRoute(resolved, dest);
    }
    navigatingRef.current = false;
    setPendingDestination(null);
  }, [pendingDestination, confirmOutside, beginRoute, resetStart]);

  const handleInsideDismiss = useCallback(() => {
    navigatingRef.current = false;
    setPendingDestination(null);
    resetStart();
  }, [resetStart]);

  const showSearchResults = isSearching;

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

        <FromChip start={start} onPress={openStartSheet} />

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
              <Text style={styles.sectionTitle}>
                {t('home.categoriesTitle')}
              </Text>
              <CategoryChips selected={null} onSelect={setCategory} />
            </View>
          </ScrollView>
        )}
      </View>

      {/* Starting-point sheet */}
      <StartingPointSheet
        visible={startSheetOpen}
        places={nearbyPlaces}
        mode={startSheetMode}
        onChoose={handleChoosePlace}
        onUseGps={handleUseGps}
        onImInside={handleImInside}
        onCancel={() => {
          setStartSheetOpen(false);
          setStartSheetMode('choose');
        }}
      />

      {/* Door picker */}
      <DoorPickerSheet
        visible={doorPickerOpen}
        buildingName={suspiciousBuilding}
        onPick={handleDoorPicked}
        onCancel={() => setDoorPickerOpen(false)}
      />

      {/* Are you inside? */}
      <AreYouInsideSheet
        visible={startState === 'askIndoor'}
        buildingName={suspiciousBuilding}
        onYes={handleInsideYes}
        onNo={handleInsideNo}
        onCancel={handleInsideDismiss}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSubtle },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: SPACING.xl },
  featureRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.md,
  },
  chipsWrapper: { marginTop: SPACING.md },
  sectionTitle: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
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