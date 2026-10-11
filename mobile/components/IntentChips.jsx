// A horizontal row of intent chips for Explore. Tapping one filters
// the grid by that intent. Tapping the active one clears it.
//
// `counts` is optional. When provided (from /api/places/tags), any
// intent whose count is zero is hidden. When null, every chip is
// shown — better to show a chip that might be empty than to hide
// chips we can't count.

import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { INTENTS } from '@/constants/intents';
import { t } from '@/i18n';
import { COLORS, RADIUS, SPACING, TOUCH } from '@/constants/theme';

export function IntentChips({ selected, onSelect, counts = null }) {
  const visible = INTENTS.filter((intent) => {
    if (counts == null) return true;
    const n = counts[intent.key];
    return typeof n === 'number' && n > 0;
  });

  if (visible.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      {visible.map((intent) => {
        const isSelected = selected === intent.key;
        return (
          <TouchableOpacity
            key={intent.key}
            style={[styles.chip, isSelected && styles.chipSelected]}
            onPress={() => onSelect(isSelected ? null : intent.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={t(intent.labelKey)}
          >
            <Text
              style={[styles.label, isSelected && styles.labelSelected]}
              numberOfLines={1}
            >
              {t(intent.labelKey)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
    maxHeight: TOUCH.minHeight + 8,
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    alignItems: 'center',
  },
  chip: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    height: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: '#0d9488',
    borderColor: '#0d9488',
  },
  label: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  labelSelected: { color: '#ffffff' },
});