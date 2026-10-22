// "Inside this building" — the list of rooms and offices inside a
// building, grouped by floor.
//
// Shown on its own screen (app/building-rooms.jsx). The rooms come
// from /api/places?kind=indoor&building_name=<name>, which returns
// every indoor place whose building_name tag matches the building's
// name.
//
// Only the door's name is shown. The room_name field is not
// rendered — it's redundant with the door name in most buildings.

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { listPlaces } from '@/services/api';
import { t } from '@/i18n';
import { levelLabel } from '@/utils/levelLabel';
import { formatPlaceName, searchableText } from '@/utils/placeLabel';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';

const SEARCH_THRESHOLD = 10;

export function BuildingRooms({ buildingName, onOpenRoom }) {
  const [rooms, setRooms] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!buildingName) {
      setRooms([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    listPlaces({
      kind: 'indoor',
      building_name: buildingName,
      limit: 2000,
    })
      .then((data) => {
        if (!cancelled) setRooms(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || t('common.error'));
          setRooms([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [buildingName]);

  const filtered = useMemo(() => {
    if (!rooms) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => searchableText(r).includes(q));
  }, [rooms, search]);

  const grouped = useMemo(() => groupByLevel(filtered), [filtered]);

  if (!loading && (!rooms || rooms.length === 0)) {
    return null;
  }

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>
          {t('place.insideThisBuilding')}
        </Text>
        {rooms && rooms.length > 0 ? (
          <Text style={styles.count}>
            {t('place.roomCount', { count: rooms.length })}
          </Text>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={COLORS.textMuted} />
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <>
          {rooms.length > SEARCH_THRESHOLD ? (
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={t('place.searchRoomsPlaceholder')}
              placeholderTextColor={COLORS.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          ) : null}

          {grouped.length === 0 ? (
            <Text style={styles.emptyText}>{t('common.noResults')}</Text>
          ) : (
            grouped.map((group) => (
              <View key={group.level} style={styles.levelGroup}>
                <Text style={styles.levelLabel}>
                  {levelLabel(group.level)}
                </Text>
                {group.rooms.map((room) => (
                  <TouchableOpacity
                    key={room.id}
                    style={styles.roomRow}
                    onPress={() => onOpenRoom(room)}
                    accessibilityRole="button"
                    accessibilityLabel={formatPlaceName(room)}
                  >
                    <Text style={styles.roomName} numberOfLines={2}>
                      {formatPlaceName(room)}
                    </Text>
                    <MaterialIcons
                      name="chevron-right"
                      size={20}
                      color={COLORS.textMuted}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            ))
          )}
        </>
      )}
    </View>
  );
}

function groupByLevel(rooms) {
  const byLevel = new Map();
  for (const room of rooms) {
    const level = normaliseLevel(room.level);
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push(room);
  }
  const groups = Array.from(byLevel.entries()).map(([level, list]) => {
    list.sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, {
        sensitivity: 'base',
      })
    );
    return { level, rooms: list };
  });
  groups.sort((a, b) => levelSortKey(a.level) - levelSortKey(b.level));
  return groups;
}

function normaliseLevel(level) {
  if (level == null) return '0';
  const s = String(level).split(';')[0].trim();
  return s || '0';
}

function levelSortKey(level) {
  const n = Number(level);
  if (Number.isFinite(n)) return n;
  return 999;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  count: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textFaint,
  },
  state: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  error: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.small,
    textAlign: 'center',
  },
  searchInput: {
    backgroundColor: COLORS.backgroundSubtle,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  levelGroup: {
    marginBottom: SPACING.md,
  },
  levelLabel: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textFaint,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: TOUCH.minHeight,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  roomName: {
    flex: 1,
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
    fontWeight: '500',
  },
});

