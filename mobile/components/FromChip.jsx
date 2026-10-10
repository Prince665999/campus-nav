// The "From:" chip.
//
// Shows the current starting point. Tapping it opens the
// starting-point sheet, where the student can change it.

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';

export function FromChip({ start, onPress }) {
  let label;
  if (start?.placeId != null) {
    label = t('start.chipFromPlace', {
      name: start.placeName || 'selected place',
    });
  } else if (start?.lat != null) {
    label = t('start.chipMyLocation');
  } else {
    label = t('start.chipMyLocation');
  }

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={styles.chip}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <MaterialIcons
          name="my-location"
          size={14}
          color={COLORS.textMuted}
          style={styles.icon}
        />
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <MaterialIcons
          name="expand-more"
          size={16}
          color={COLORS.textMuted}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: SPACING.md,
    paddingTop: 4,
    paddingBottom: 8,
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSubtle,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    height: 32,
    minHeight: 32,
    maxWidth: '100%',
  },
  icon: { marginRight: 6 },
  label: {
    fontSize: FONT_SIZE.small,
    color: COLORS.text,
    maxWidth: 240,
    marginRight: 4,
  },
});