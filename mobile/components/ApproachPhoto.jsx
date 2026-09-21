// A floating card that appears at the bottom of the walking screen
// when the student is close to the destination.

import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

export function ApproachPhoto({ photo, destinationName, onDismiss }) {
  if (!photo) return null;

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={styles.dismiss}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <Text style={styles.dismissText}>✕</Text>
      </TouchableOpacity>

      <Image
        source={{ uri: photo.url_card }}
        style={styles.image}
        resizeMode="cover"
      />

      <View style={styles.caption}>
        <Text style={styles.captionText} numberOfLines={1}>
          {t('walking.approaching', { name: destinationName })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    bottom: 200,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  dismiss: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  image: {
    width: '100%',
    height: 140,
    backgroundColor: COLORS.borderSubtle,
  },
  caption: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  captionText: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
  },
});