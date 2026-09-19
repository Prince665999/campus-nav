// One result row in the search results.

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function PlaceCard({ place, onPress }) {
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
    </TouchableOpacity>
  );
}

// Turn "amenity=restaurant" into "Restaurant".
function prettifyCategory(category) {
  const value = category.includes('=') ? category.split('=')[1] : category;
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  body: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  nameSw: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  category: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 4,
  },
});