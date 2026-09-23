// One result row in the search results, or in the recents or
// favorites list on Home.

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { COLORS, FONT_SIZE, SPACING, TOUCH } from '@/constants/theme';
import { ICONS } from '@/constants/icons';

export function PlaceCard({ place, onPress, isFavorite = false }) {
  const subtitle = place.category ? prettifyCategory(place.category) : null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={place.name}
      accessibilityHint={
        place.name_sw ? `Also known as ${place.name_sw}` : undefined
      }
    >
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {place.name}
        </Text>
        {place.name_sw ? (
          <Text style={styles.nameSw} numberOfLines={1}>
            {place.name_sw}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={styles.category} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {isFavorite ? (
        <MaterialIcons
          name={ICONS.favoriteFilled}
          size={20}
          color={COLORS.warning}
          accessibilityLabel="Favorite"
        />
      ) : null}
    </TouchableOpacity>
  );
}

function prettifyCategory(category) {
  const value = category.includes('=') ? category.split('=')[1] : category;
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    minHeight: TOUCH.minHeight,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  body: { flex: 1 },
  name: {
    fontSize: FONT_SIZE.body + 1,
    fontWeight: '600',
    color: COLORS.text,
  },
  nameSw: {
    fontSize: FONT_SIZE.body - 1,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  category: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textFaint,
    marginTop: 4,
  },
});