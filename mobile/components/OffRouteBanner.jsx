// Banner shown when the student has been off-route for several
// consecutive GPS fixes.

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { t } from '@/i18n';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';

export function OffRouteBanner({ onRecalculate, onDismiss }) {
  return (
    <View style={styles.banner}>
      <View style={styles.body}>
        <Text style={styles.title}>{t('walking.offRouteTitle')}</Text>
        <Text style={styles.subtitle}>
          {t('walking.offRouteSubtitle')}
        </Text>
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
        <Text style={styles.dismissText}>✕</Text>
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
  },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: COLORS.warningText },
  subtitle: { fontSize: 13, color: COLORS.warningTextSubtle, marginTop: 2 },
  button: {
    backgroundColor: COLORS.warningText,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
  },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  dismissButton: { padding: 6 },
  dismissText: { color: COLORS.warningText, fontSize: 16, fontWeight: '600' },
});