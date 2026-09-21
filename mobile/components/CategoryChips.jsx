// Horizontal scroll of category filter chips.

import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { CATEGORIES } from '@/constants/categories';
import { t } from '@/i18n';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';

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
            <Text style={styles.icon}>{cat.icon}</Text>
            <Text style={[styles.label, isSelected && styles.labelSelected]}>
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
    maxHeight: 44,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  chipSelected: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  icon: { fontSize: 14 },
  label: { fontSize: 14, color: '#374151', fontWeight: '500' },
  labelSelected: { color: '#ffffff' },
});