// "Are you inside [building]?" bottom sheet.
//
// Shown when the GPS fix is suspicious (near a building entrance, or
// accuracy worse than 25 m). The student answers yes or no.
//
//   Yes → the caller opens the door picker.
//   No  → the caller routes from the suspicious fix.
//
// Dismissing the sheet cancels — the caller does not route.

import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';

export function AreYouInsideSheet({
  visible,
  buildingName,
  onYes,
  onNo,
  onCancel,
}) {
  const insets = useSafeAreaInsets();

  const title = buildingName
    ? t('start.areYouInsideNamed', { name: buildingName })
    : t('start.areYouInsideUnnamed');

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
          <View style={styles.headerRow}>
            <MaterialIcons
              name="place"
              size={22}
              color={COLORS.primaryDark}
            />
            <TouchableOpacity
              onPress={onCancel}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <MaterialIcons
                name="close"
                size={22}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{t('start.areYouInsideBody')}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.yesButton]}
              onPress={onYes}
              accessibilityRole="button"
            >
              <Text style={styles.yesText}>
                {t('start.areYouInsideYes')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.noButton]}
              onPress={onNo}
              accessibilityRole="button"
            >
              <Text style={styles.noText}>
                {t('start.areYouInsideNo')}
              </Text>
            </TouchableOpacity>
          </View>
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
    paddingTop: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  closeButton: {
    padding: 6,
    minWidth: TOUCH.minWidth,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FONT_SIZE.large + 2,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  body: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    minHeight: TOUCH.minHeight,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yesButton: { backgroundColor: COLORS.primaryDark },
  noButton: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  yesText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  noText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
});