// A horizontal strip of up to 3 recent or favorite places.
//
// Recents and favorites are merged into a single list, deduplicated
// by place_id, with favorites shown first. Each card is a small
// tappable item showing the place name and, if favorited, a star.

import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';
import { ICONS } from '@/constants/icons';

const MAX_ITEMS = 3;

export function RecentStrip({ recents = [], favorites = [], onPress }) {
  // Merge: favorites first, then recents that aren't already
  // favorites. Deduplicate by place_id.
  const seen = new Set();
  const items = [];

  for (const f of favorites) {
    if (seen.has(f.place_id)) continue;
    seen.add(f.place_id);
    items.push({ ...f, isFavorite: true });
  }
  for (const r of recents) {
    if (seen.has(r.place_id)) continue;
    seen.add(r.place_id);
    items.push({ ...r, isFavorite: false });
  }

  const visible = items.slice(0, MAX_ITEMS);

  if (visible.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('home.frequentTitle')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        {visible.map((item) => (
          <TouchableOpacity
            key={item.place_id}
            style={styles.card}
            onPress={() => onPress(item)}
            accessibilityRole="button"
            accessibilityLabel={item.name}
          >
            <View style={styles.cardHeader}>
              <MaterialIcons
                name={ICONS.place}
                size={16}
                color={COLORS.textMuted}
              />
              {item.isFavorite ? (
                <MaterialIcons
                  name={ICONS.favoriteFilled}
                  size={16}
                  color={COLORS.warning}
                  accessibilityLabel="Favorite"
                />
              ) : null}
            </View>
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            {item.category ? (
              <Text style={styles.category} numberOfLines={1}>
                {prettifyCategory(item.category)}
              </Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function prettifyCategory(category) {
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
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  card: {
    width: 140,
    minHeight: TOUCH.minHeight + 30,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  name: {
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
    color: COLORS.text,
  },
  category: {
    fontSize: FONT_SIZE.small - 1,
    color: COLORS.textFaint,
    marginTop: 4,
  },
});