// One card in the two-column grid on Explore.

import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { ICONS } from '@/constants/icons';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

const PLACEHOLDER_COLORS = [
  '#dbeafe',
  '#e0f2fe',
  '#dcfce7',
  '#fef9c3',
  '#fee2e2',
  '#fae8ff',
  '#fce7f3',
  '#e0e7ff',
];

function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
}

export function ExploreGridCard({ place, onPress }) {
  const photo = place.primary_photo_url;
  const placeholderColor = colorForName(place.name);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={place.name}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
      ) : (
        <View style={[styles.photo, styles.placeholder, { backgroundColor: placeholderColor }]}>
          <MaterialIcons
            name={ICONS[place.categoryIconKey] || ICONS.place}
            size={32}
            color={COLORS.textMuted}
          />
        </View>
      )}
      <View style={styles.caption}>
        <Text style={styles.name} numberOfLines={2}>
          {place.name}
        </Text>
        {place.name_sw ? (
          <Text style={styles.nameSw} numberOfLines={1}>
            {place.name_sw}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: 110,
    backgroundColor: COLORS.borderSubtle,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    padding: SPACING.sm + 2,
    minHeight: 52,
  },
  name: {
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
    color: COLORS.text,
  },
  nameSw: {
    fontSize: FONT_SIZE.small - 1,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});