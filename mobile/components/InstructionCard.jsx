// The card at the bottom of the walking screen.

import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompassArrow } from '@/components/CompassArrow';
import { useAccessibility } from '@/hooks/useAccessibility';
import { t } from '@/i18n';
import { COLORS, SPACING } from '@/constants/theme';
import { formatDistance } from '@/utils/format';

export function InstructionCard({
  step,
  distanceToNextStepM,
  distanceRemainingM,
  progress,
  heading,
  bearing,
  gpsStale = false,
}) {
  const insets = useSafeAreaInsets();
  const { fonts } = useAccessibility();

  if (!step) {
    return (
      <View style={[styles.card, { paddingBottom: insets.bottom + SPACING.md }]}>
        <Text style={[styles.instruction, { fontSize: fonts.title }]}>
          {t('walking.calculating')}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.card, { paddingBottom: insets.bottom + SPACING.md }]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${step.instruction}. ${formatDistance(
        distanceToNextStepM
      )} to next. ${formatDistance(distanceRemainingM)} remaining.`}
    >
      <View style={styles.progressBar}>
        <View
          style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
        />
      </View>

      {gpsStale ? (
        <View style={styles.gpsStrip}>
          <Text style={styles.gpsText}>{t('walking.searchingGps')}</Text>
        </View>
      ) : null}

      <View style={styles.body}>
        <CompassArrow
          heading={heading}
          bearing={bearing}
          distanceM={distanceToNextStepM}
        />

        <View style={styles.textBlock}>
          <Text
            style={[styles.instruction, { fontSize: fonts.title }]}
            numberOfLines={3}
          >
            {step.instruction}
          </Text>

          <View style={styles.meta}>
            <Text style={[styles.metaItem, { fontSize: fonts.small + 1 }]}>
              {formatDistance(distanceToNextStepM)} {t('common.toNext')}
            </Text>
            <Text style={[styles.metaItem, { fontSize: fonts.small + 1 }]}>
              {formatDistance(distanceRemainingM)} {t('common.left')}
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
    height: 4,
    backgroundColor: COLORS.border,
  },
  progressFill: {
    height: 4,
    backgroundColor: COLORS.primary,
  },
  gpsStrip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 6,
    backgroundColor: COLORS.warningBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.warningBorder,
  },
  gpsText: {
    fontSize: 12,
    color: COLORS.warningText,
    fontWeight: '500',
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
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 32,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  metaItem: {
    color: COLORS.textMuted,
  },
});