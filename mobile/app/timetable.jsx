// The timetable screen. Shows one day at a time, with day tabs
// across the top. If no program/year is stored, shows the picker
// inline.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, Stack } from 'expo-router';

import { ProgramYearPicker } from '@/components/ProgramYearPicker';
import { TimetableRow } from '@/components/TimetableRow';
import { useTimetableSelection } from '@/hooks/useTimetableSelection';
import { getWeek } from '@/services/timetable';
import { setRouteRequest } from '@/services/routeRequest';
import { t } from '@/i18n';
import {
  DAY_LABEL_KEYS,
  DAY_NAMES,
  DAY_SHORT_LABEL_KEYS,
  WEEKDAYS,
} from '@/constants/timetable';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';

export default function TimetableScreen() {
  const { programYearId, setSelection } = useTimetableSelection();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date().getDay(); // 0 = Sunday in JS
    // Convert JS day (0=Sun) to our day (0=Mon). Sat/Sun → Monday.
    const mondayBased = (today + 6) % 7;
    return mondayBased <= 4 ? mondayBased : 0;
  });

  const loadWeek = useCallback(async () => {
    if (!programYearId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getWeek(programYearId);
      setEntries(data.entries || []);
    } catch (err) {
      setError(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [programYearId]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  // Filter entries for the selected day.
  const dayEntries = useMemo(
    () => entries.filter((e) => e.day_of_week === selectedDay),
    [entries, selectedDay]
  );

  // Open the venue's place detail, or route directly to it.
  const openVenue = useCallback((entry) => {
    if (entry.venue_place_id == null) return;
    router.push(`/place/${entry.venue_place_id}`);
  }, []);

  // If no selection yet, show the picker first.
  if (!programYearId) {
    return (
      <>
        <Stack.Screen options={{ title: t('timetable.title') }} />
        <View style={styles.pickerWrapper}>
          <Text style={styles.pickerIntro}>
            {t('timetable.picker.intro')}
          </Text>
          <ProgramYearPicker onSelect={setSelection} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('timetable.title') }} />
      <View style={styles.container}>
        {/* Day tabs */}
        <View style={styles.tabsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
          >
            {WEEKDAYS.map((d) => {
              const active = selectedDay === d;
              return (
                <TouchableOpacity
                  key={d}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => setSelectedDay(d)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[styles.tabText, active && styles.tabTextActive]}
                  >
                    {t(DAY_SHORT_LABEL_KEYS[d])}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Day header */}
        <View style={styles.dayHeader}>
          <Text style={styles.dayHeaderText}>
            {t(DAY_LABEL_KEYS[selectedDay])}
          </Text>
          {dayEntries.length > 0 ? (
            <Text style={styles.dayHeaderCount}>
              {t('timetable.periodsCount', { count: dayEntries.length })}
            </Text>
          ) : null}
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.state}>
            <ActivityIndicator color={COLORS.textMuted} />
          </View>
        ) : error ? (
          <View style={styles.state}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : dayEntries.length === 0 ? (
          <View style={styles.state}>
            <Text style={styles.emptyText}>
              {t('timetable.noClasses')}
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.list}>
            {dayEntries.map((entry) => (
              <TimetableRow
                key={entry.id}
                entry={entry}
                onPress={openVenue}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  pickerWrapper: {
    flex: 1,
    padding: SPACING.md,
    backgroundColor: COLORS.background,
  },
  pickerIntro: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  tabsWrapper: {
    backgroundColor: COLORS.backgroundSubtle,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexGrow: 0,
  },
  tabsRow: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  tab: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 54,
  },
  tabActive: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  tabText: {
    fontSize: FONT_SIZE.small + 1,
    color: COLORS.text,
    fontWeight: '600',
  },
  tabTextActive: { color: '#ffffff' },
  dayHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  dayHeaderText: {
    fontSize: FONT_SIZE.large,
    fontWeight: '700',
    color: COLORS.text,
  },
  dayHeaderCount: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
  },
  list: { flex: 1 },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  emptyText: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  errorText: {
    fontSize: FONT_SIZE.body,
    color: COLORS.danger,
    textAlign: 'center',
  },
});