// Bottom sheet asking the student where they're starting from.
//
// Three options:
//   - Use my current location (GPS)
//   - Pick a starting place (outdoor place list)
//   - I'm inside a building (indoor door picker)
//
// Shown when:
//   - The student taps the "From:" chip.
//   - GPS fails and we don't have a remembered start.

import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';

export function StartingPointSheet({
  visible,
  places,
  onChoose,
  onUseGps,
  onImInside,
  onCancel,
  mode = 'choose', // 'choose' | 'place-list'
}) {
  const insets = useSafeAreaInsets();

  // When we're showing the outdoor place list, we switch the content
  // and hide the three-option menu.
  const showingPlaces = mode === 'place-list';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + SPACING.md },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>
                {showingPlaces
                  ? t('start.pickPlaceTitle')
                  : t('start.title')}
              </Text>
              <Text style={styles.subtitle}>
                {showingPlaces
                  ? t('start.pickPlaceSubtitle')
                  : t('start.subtitle')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onCancel}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <MaterialIcons
                name="close"
                size={22}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>
          </View>

          {!showingPlaces ? (
            <View style={styles.options}>
              <OptionRow
                icon="my-location"
                label={t('start.optionUseGps')}
                onPress={onUseGps}
              />
              <OptionRow
                icon="place"
                label={t('start.optionPickPlace')}
                onPress={() => onChoose(null)}
              />
              <OptionRow
                icon="meeting-room"
                label={t('start.optionImInside')}
                onPress={onImInside}
              />
            </View>
          ) : places.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t('start.noPlaces')}</Text>
            </View>
          ) : (
            <FlatList
              data={places}
              keyExtractor={(item) => String(item.id)}
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => onChoose(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                >
                  <MaterialIcons
                    name="place"
                    size={20}
                    color={COLORS.textMuted}
                    style={styles.rowIcon}
                  />
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    {item.name_sw ? (
                      <Text style={styles.rowNameSw}>{item.name_sw}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function OptionRow({ icon, label, onPress }) {
  return (
    <TouchableOpacity
      style={styles.optionRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialIcons
        name={icon}
        size={22}
        color={COLORS.text}
        style={styles.optionIcon}
      />
      <Text style={styles.optionLabel}>{label}</Text>
      <MaterialIcons
        name="chevron-right"
        size={22}
        color={COLORS.textMuted}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  subtitle: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  closeButton: {
    padding: 6,
    minWidth: TOUCH.minWidth,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  options: { marginTop: SPACING.sm },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
    minHeight: TOUCH.minHeight,
  },
  optionIcon: { marginRight: SPACING.md },
  optionLabel: {
    flex: 1,
    fontSize: FONT_SIZE.body + 1,
    color: COLORS.text,
    fontWeight: '500',
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
    minHeight: TOUCH.minHeight,
  },
  rowIcon: { marginRight: SPACING.md },
  rowText: { flex: 1 },
  rowName: { fontSize: FONT_SIZE.body, color: COLORS.text, fontWeight: '500' },
  rowNameSw: { fontSize: FONT_SIZE.small, color: COLORS.textMuted, marginTop: 2 },
  emptyState: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.body,
    textAlign: 'center',
  },
});