// Door picker.
//
// A single search field over indoor doors. The student types a name
// and taps a result. The picked door's place_id is returned to the
// caller as the route start.
//
// We show the door's name. Building and level are shown as a
// subtitle so results across buildings are distinguishable.
//
// `buildingName` is optional. If passed, the list is scoped to that
// building. If null, the list spans all buildings — used by the
// route-preview recovery flow, where we don't know the building.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { listIndoorDoors } from '@/services/api';
import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';

export function DoorPickerSheet({
  visible,
  buildingName = null,
  onPick,
  onCancel,
}) {
  const insets = useSafeAreaInsets();

  const [doors, setDoors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setSearch('');

    listIndoorDoors({ buildingName: buildingName || undefined })
      .then((data) => {
        if (!cancelled) setDoors(Array.isArray(data) ? data : []);
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
  }, [visible, buildingName]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return doors;
    return doors.filter((d) => {
      const haystack = [d.name || '', d.room_name || '', d.building_name || '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [doors, search]);

  const handlePick = useCallback(
    (door) => {
      onPick(door);
    },
    [onPick]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View
        style={[styles.container, { paddingTop: insets.top + SPACING.md }]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('start.doorPickerTitle')}</Text>
          <TouchableOpacity
            onPress={onCancel}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <MaterialIcons name="close" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t('start.doorPickerSearchPlaceholder')}
          placeholderTextColor={COLORS.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />

        {error ? (
          <View style={styles.state}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : loading ? (
          <View style={styles.state}>
            <ActivityIndicator color={COLORS.textMuted} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.state}>
            <Text style={styles.emptyText}>
              {search.trim()
                ? t('common.noResults')
                : t('start.doorPickerEmpty')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => handlePick(item)}
                accessibilityRole="button"
                accessibilityLabel={item.name}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {[item.building_name, item.level != null ? `Level ${item.level}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  title: { fontSize: FONT_SIZE.title, fontWeight: '700', color: COLORS.text },
  closeButton: {
    padding: 6,
    minWidth: TOUCH.minWidth,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.backgroundSubtle,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: FONT_SIZE.body,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  error: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
  },
  listContent: { paddingBottom: SPACING.lg },
  row: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
    minHeight: TOUCH.minHeight,
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowName: {
    fontSize: FONT_SIZE.body + 1,
    fontWeight: '600',
    color: COLORS.text,
  },
  rowSubtitle: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});