// The card at the bottom of the walking screen.
//
// Shows the current instruction, the distance to the next turn, a
// thin progress bar, and a compass arrow pointing at the next turn.
//
// The bottom edge uses safe-area inset so the card isn't covered by
// the phone's navigation bar or home indicator.

import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompassArrow } from '@/components/CompassArrow';
import { COLORS, FONT_SIZE, SPACING } from '@/constants/theme';
import { formatDistance } from '@/utils/format';

export function InstructionCard({
  step,
  distanceToNextStepM,
  distanceRemainingM,
  progress,
  heading,
  bearing,
}) {
  const insets = useSafeAreaInsets();

  if (!step) {
    return (
      <View style={[styles.card, { paddingBottom: insets.bottom + SPACING.md }]}>
        <Text style={styles.instruction}>Calculating route…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { paddingBottom: insets.bottom + SPACING.md }]}>
      <View style={styles.progressBar}>
        <View
          style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
        />
      </View>

      <View style={styles.body}>
        <CompassArrow
          heading={heading}
          bearing={bearing}
          distanceM={distanceToNextStepM}
        />

        <View style={styles.textBlock}>
          <Text style={styles.instruction} numberOfLines={3}>
            {step.instruction}
          </Text>

          <View style={styles.meta}>
            <Text style={styles.metaItem}>
              {formatDistance(distanceToNextStepM)} to next
            </Text>
            <Text style={styles.metaItem}>
              {formatDistance(distanceRemainingM)} left
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  progressBar: {
    height: 3,
    backgroundColor: COLORS.border,
  },
  progressFill: {
    height: 3,
    backgroundColor: COLORS.primary,
  },
  body: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  textBlock: { flex: 1 },
  instruction: {
    fontSize: FONT_SIZE.title,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 28,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  metaItem: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
});