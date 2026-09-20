// The card at the bottom of the walking screen.
//
// Shows the current instruction, the distance to the next turn, and
// a thin progress bar. Auto-advances as the student walks because
// the parent re-renders when the current step changes.

import { StyleSheet, Text, View } from 'react-native';
import { formatDistance } from '@/utils/format';

export function InstructionCard({
  step,
  distanceToNextStepM,
  distanceRemainingM,
  progress,
}) {
  if (!step) {
    return (
      <View style={styles.card}>
        <Text style={styles.instruction}>Calculating route…</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.progressBar}>
        <View
          style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
        />
      </View>

      <View style={styles.body}>
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
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingBottom: 16,
  },
  progressBar: {
    height: 3,
    backgroundColor: '#e5e7eb',
  },
  progressFill: {
    height: 3,
    backgroundColor: '#2563eb',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  instruction: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 28,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  metaItem: {
    fontSize: 14,
    color: '#6b7280',
  },
});