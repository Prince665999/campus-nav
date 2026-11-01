// A full-width tappable banner: icon on the left, title and
// description in the middle, a chevron on the right.
// Used on the Home screen for the Explore entry point.

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';

export function FeatureCard({ icon, iconColor, title, description, onPress }) {
  const tint = iconColor || COLORS.primary;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
    >
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: iconColor ? `${iconColor}20` : COLORS.primaryTint },
        ]}
      >
        <MaterialIcons name={icon} size={28} color={tint} />
      </View>

      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.description} numberOfLines={2}>
          {description}
        </Text>
      </View>

      <MaterialIcons
        name="chevron-right"
        size={28}
        color={COLORS.textFaint}
        style={styles.chevron}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    minHeight: Math.max(TOUCH.minHeight, 84),
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  textBlock: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: FONT_SIZE.large,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  description: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  chevron: {
    marginLeft: SPACING.sm,
  },
});
