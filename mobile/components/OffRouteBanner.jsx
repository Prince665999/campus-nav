// Banner shown when the student has been off-route for several
// consecutive GPS fixes.

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';
import { ICONS } from '@/constants/icons';

export function OffRouteBanner({ onRecalculate, onDismiss }) {
  return (
    <View
      style={styles.banner}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={t('walking.offRouteTitle')}
      accessibilityHint={t('walking.offRouteSubtitle')}
    >
      <MaterialIcons
        name={ICONS.warning}
        size={22}
        color={COLORS.warningText}
        style={styles.icon}
      />

      <View style={styles.body}>
        <Text style={styles.title}>{t('walking.offRouteTitle')}</Text>
        <Text style={styles.subtitle}>{t('walking.offRouteSubtitle')}</Text>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={onRecalculate}
        accessibilityRole="button"
        accessibilityLabel={t('walking.recalculate')}
      >
        <Text style={styles.buttonText}>{t('walking.recalculate')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        style={styles.dismissButton}
      >
        <MaterialIcons
          name={ICONS.close}
          size={18}
          color={COLORS.warningText}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.warningBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    gap: SPACING.sm,
    minHeight: TOUCH.minHeight,
  },
  icon: {
    marginRight: 4,
  },
  body: { flex: 1 },
  title: {
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
    color: COLORS.warningText,
  },
  subtitle: {
    fontSize: FONT_SIZE.small,
    color: COLORS.warningTextSubtle,
    marginTop: 2,
  },
  button: {
    backgroundColor: COLORS.warningText,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
  },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  dismissButton: {
    padding: 8,
    minWidth: TOUCH.minWidth,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});