// Place detail screen.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import {
  addFavorite,
  getPlace,
  isFavorite,
  listMediaForPlace,
  removeFavorite,
} from '@/services/api';
import { setRouteRequest } from '@/services/routeRequest';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { ReportSheet } from '@/components/ReportSheet';
import { StartingPointSheet } from '@/components/StartingPointSheet';
import { DoorPickerSheet } from '@/components/DoorPickerSheet';
import { AreYouInsideSheet } from '@/components/AreYouInsideSheet';
import { FromChip } from '@/components/FromChip';
import { useStartingPoint } from '@/hooks/useStartingPoint';
import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';
import { ICONS } from '@/constants/icons';

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams();
  const placeId = Number(id);

  const [place, setPlace] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [resolvingStart, setResolvingStart] = useState(false);

  const [startSheetOpen, setStartSheetOpen] = useState(false);
  const [startSheetMode, setStartSheetMode] = useState('choose');
  const [doorPickerOpen, setDoorPickerOpen] = useState(false);

  const navigatingRef = useRef(false);

  const {
    state: startState,
    start,
    nearbyPlaces,
    suspiciousBuilding,
    resolveStart,
    choosePlace,
    confirmOutside,
    loadOutdoorPlaces,
    forgetStart,
    reset: resetStart,
  } = useStartingPoint();

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
    setFavorited(next);
    try {
      if (next) {
        await addFavorite(placeId);
      } else {
        await removeFavorite(placeId);
      }
    } catch {
      setFavorited(!next);
    }
  }, [favorited, placeId]);

  const navigateToRoute = useCallback(
    (resolvedStart) => {
      if (!place) return;
      if (resolvedStart.lat != null && resolvedStart.lon != null) {
        setRouteRequest({
          fromLat: resolvedStart.lat,
          fromLon: resolvedStart.lon,
          fromAccuracyM: resolvedStart.accuracyM,
          toId: place.id,
        });
      } else if (resolvedStart.placeId != null) {
        setRouteRequest({
          fromId: resolvedStart.placeId,
          toId: place.id,
        });
      } else {
        setError(t('start.couldNotResolve'));
        return;
      }
      router.push('/route-preview');
    },
    [place]
  );

  const takeMeThere = useCallback(async () => {
    if (!place) return;
    if (navigatingRef.current) return;
    navigatingRef.current = true;

    // If the student has explicitly chosen a start via the chip,
    // use it directly.
    if (start && start.placeId != null) {
      navigateToRoute(start);
      navigatingRef.current = false;
      return;
    }

    setResolvingStart(true);
    setError(null);

    try {
      const result = await resolveStart({ destinationPlaceId: place.id });

      switch (result.status) {
        case 'ok':
        case 'ok_place':
          navigateToRoute(result.start);
          setResolvingStart(false);
          navigatingRef.current = false;
          return;

        case 'ask':
          // AreYouInsideSheet will show; the student's answer
          // drives the rest.
          setResolvingStart(false);
          return;

        case 'pick':
          setStartSheetMode('place-list');
          setStartSheetOpen(true);
          setResolvingStart(false);
          return;

        case 'denied':
          if (result.reason === 'permission_denied') {
            setError(t('start.permissionDenied'));
          } else {
            setError(t('common.error'));
          }
          setResolvingStart(false);
          navigatingRef.current = false;
          return;

        default:
          setResolvingStart(false);
          navigatingRef.current = false;
          return;
      }
    } catch (err) {
      setError(err.message || t('common.error'));
      setResolvingStart(false);
      navigatingRef.current = false;
    }
  }, [place, start, resolveStart, navigateToRoute]);

  const handleInsideYes = useCallback(() => {
    setDoorPickerOpen(true);
  }, []);

  const handleInsideNo = useCallback(() => {
    const resolved = confirmOutside();
    if (resolved && place) {
      navigateToRoute(resolved);
    }
    navigatingRef.current = false;
  }, [confirmOutside, navigateToRoute, place]);

  const handleInsideDismiss = useCallback(() => {
    navigatingRef.current = false;
    resetStart();
  }, [resetStart]);

  const handleDoorPicked = useCallback(
    (door) => {
      setDoorPickerOpen(false);
      if (!place) return;
      // The picked door IS the start. Route straight to this place.
      setRouteRequest({
        fromId: door.id,
        toId: place.id,
      });
      router.push('/route-preview');
    },
    [place]
  );

  const openStartSheet = useCallback(() => {
    setStartSheetMode('choose');
    setStartSheetOpen(true);
    resetStart();
  }, [resetStart]);

  const handleChoosePlace = useCallback(
    (chosen) => {
      if (chosen == null) {
        setStartSheetMode('place-list');
        if (nearbyPlaces.length === 0) {
          loadOutdoorPlaces({ excludePlaceId: place?.id ?? null });
        }
        return;
      }
      choosePlace(chosen);
      setStartSheetOpen(false);
      setStartSheetMode('choose');
    },
    [choosePlace, nearbyPlaces.length, loadOutdoorPlaces, place]
  );

  const handleUseGps = useCallback(() => {
    setStartSheetOpen(false);
    forgetStart();
  }, [forgetStart]);

  const handleImInside = useCallback(() => {
    setStartSheetOpen(false);
    setDoorPickerOpen(true);
  }, []);

  if (loading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={COLORS.textMuted} />
      </View>
    );
  }

  if (error && !place) {
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
              <MaterialIcons
                name={favorited ? ICONS.favoriteFilled : ICONS.favoriteOutline}
                size={22}
                color={favorited ? COLORS.warning : COLORS.text}
              />
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

        <FromChip start={start} onPress={openStartSheet} />

        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              resolvingStart && styles.primaryButtonDisabled,
            ]}
            onPress={takeMeThere}
            disabled={resolvingStart}
            accessibilityRole="button"
            accessibilityLabel={t('place.takeMeThere')}
          >
            {resolvingStart ? (
              <View style={styles.buttonContent}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text
                  style={[styles.primaryButtonText, styles.buttonTextSpaced]}
                >
                  {startState === 'locating'
                    ? t('start.findingLocation')
                    : t('common.loading')}
                </Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>
                {t('place.takeMeThere')}
              </Text>
            )}
          </TouchableOpacity>

          {error ? <Text style={styles.errorBelowButton}>{error}</Text> : null}

          <TouchableOpacity
            style={styles.reportLink}
            onPress={() => setReportOpen(true)}
            accessibilityRole="button"
          >
            <Text style={styles.reportLinkText}>
              {t('report.reportProblem')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        placeId={place.id}
      />

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

      <DoorPickerSheet
        visible={doorPickerOpen}
        buildingName={suspiciousBuilding}
        onPick={handleDoorPicked}
        onCancel={() => setDoorPickerOpen(false)}
      />

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
  headerButton: {
    padding: 8,
    minWidth: TOUCH.minWidth,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { opacity: 0.7 },
  buttonContent: { flexDirection: 'row', alignItems: 'center' },
  buttonTextSpaced: { marginLeft: SPACING.sm },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  errorBelowButton: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.small,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
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