// A large tappable card with an icon, title, and description.
// Used on the Home screen for the two main entry points.

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';

export function FeatureCard({ icon, iconColor, title, description, onPress }) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
    >
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: iconColor ? `${iconColor}20` : COLORS.borderSubtle },
        ]}
      >
        <MaterialIcons
          name={icon}
          size={26}
          color={iconColor || COLORS.text}
        />
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.description} numberOfLines={3}>
        {description}
      </Text>
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
    padding: SPACING.md,
    minHeight: 150,
    justifyContent: 'flex-start',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZE.large,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  description: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
});