// The featured strip at the top of Explore. Horizontally scrollable
// cards for the places marked is_landmark.
//
// If a place has a primary photo, it's shown. Otherwise a coloured
// placeholder is shown with the category icon. Same for the grid
// cards — consistent look across both.

import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { ICONS } from '@/constants/icons';
import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.72);
const CARD_HEIGHT = 180;

// A small palette for placeholder tiles. Chosen so the tile looks
// intentional rather than broken. The colour is picked by hashing
// the place name, so the same place always gets the same colour
// across renders and sessions.
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

export function FeaturedStrip({ places, onPress }) {
  if (!places || places.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('explore.featuredTitle')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        {places.map((place) => (
          <FeaturedCard
            key={place.id}
            place={place}
            onPress={() => onPress(place)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function FeaturedCard({ place, onPress }) {
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
            size={48}
            color={COLORS.textMuted}
          />
        </View>
      )}
      <View style={styles.caption}>
        <Text style={styles.name} numberOfLines={1}>
          {place.name}
        </Text>
        {place.category ? (
          <Text style={styles.category} numberOfLines={1}>
            {prettifyCategory(place.category)}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function prettifyCategory(category) {
  if (!category) return '';
  const value = category.includes('=') ? category.split('=')[1] : category;
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  scroll: { flexGrow: 0 },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT + 52,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: CARD_HEIGHT,
    backgroundColor: COLORS.borderSubtle,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    padding: SPACING.sm + 2,
  },
  name: {
    fontSize: FONT_SIZE.body + 1,
    fontWeight: '700',
    color: COLORS.text,
  },
  category: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});