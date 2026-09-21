// One result row in the search results, or in the recents or
// favorites list on Home.

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT_SIZE, SPACING } from '@/constants/theme';

export function PlaceCard({ place, onPress, isFavorite = false }) {
  const subtitle = place.category ? prettifyCategory(place.category) : null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={place.name}
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
        <Text style={styles.star} accessibilityLabel="Favorite">
          ★
        </Text>
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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  body: { flex: 1 },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  nameSw: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  category: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textFaint,
    marginTop: 4,
  },
  star: {
    fontSize: 20,
    color: COLORS.warning,
    marginLeft: SPACING.sm,
  },
});