// Indoor map placeholder. Shown in place of the outdoor tile map
// when the current step is indoor.
//
// Phase 5e-2 will replace this with an actual floor-plan render
// (rooms from `indoor_areas`, route line, destination marker).
// For now it's an honest panel: the student knows they're inside,
// and there's no misleading map underneath.

import { StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { t } from '@/i18n';
import { COLORS, FONT_SIZE, SPACING } from '@/constants/theme';

export function IndoorMapPlaceholder({ destinationName, style }) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconCircle}>
        <MaterialIcons
          name="meeting-room"
          size={48}
          color={COLORS.primaryDark}
        />
      </View>
      <Text style={styles.title}>{t('walking.indoorsTitle')}</Text>
      <Text style={styles.body}>
        {destinationName
          ? t('walking.indoorsBody', { name: destinationName })
          : t('walking.indoorsBodyNoName')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.large,
    fontWeight: '700',
    color: COLORS.primaryDark,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  body: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
});