// Horizontal scroll of category filter chips.

import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { CATEGORIES } from '@/constants/categories';
import { t } from '@/i18n';
import { COLORS, RADIUS, SPACING, TOUCH } from '@/constants/theme';
import { ICONS } from '@/constants/icons';

export function CategoryChips({ selected, onSelect }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      {CATEGORIES.map((cat) => {
        const isSelected = selected === cat.key;
        return (
          <TouchableOpacity
            key={cat.key ?? 'all'}
            style={[styles.chip, isSelected && styles.chipSelected]}
            onPress={() => onSelect(cat.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={t(cat.labelKey)}
          >
            <MaterialIcons
              name={ICONS[cat.iconKey] || ICONS.place}
              size={16}
              color={isSelected ? '#ffffff' : COLORS.textMuted}
              style={styles.icon}
            />
            <Text
              style={[styles.label, isSelected && styles.labelSelected]}
              numberOfLines={1}
            >
              {t(cat.labelKey)}
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    height: TOUCH.minHeight,
    gap: 6,
  },
  chipSelected: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  icon: { marginTop: 1 },
  label: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  labelSelected: { color: '#ffffff' },
});