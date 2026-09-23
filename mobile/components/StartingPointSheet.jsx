// Bottom sheet asking the student where they're starting from.
//
// Shown when the app can't determine the position from GPS. Offers a
// list of places to pick as the starting point.

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
import { ICONS } from '@/constants/icons';

export function StartingPointSheet({ visible, places, onChoose, onCancel }) {
  const insets = useSafeAreaInsets();

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
              <Text style={styles.title}>{t('start.title')}</Text>
              <Text style={styles.subtitle}>{t('start.subtitle')}</Text>
            </View>
            <TouchableOpacity
              onPress={onCancel}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <MaterialIcons
                name={ICONS.close}
                size={22}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>
          </View>

          {places.length === 0 ? (
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
                    name={ICONS.place}
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
    maxHeight: '80%',
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