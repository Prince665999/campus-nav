// The card at the bottom of the walking screen.

import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompassArrow } from '@/components/CompassArrow';
import { useAccessibility } from '@/hooks/useAccessibility';
import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';
import { formatDistance } from '@/utils/format';

// The card grows vertically to fit long instructions, up to this
// fraction of the screen height. Beyond that, it will scroll the
// instruction text internally. Short instructions stay at the
// default size and the card is exactly as it is today.
const MAX_CARD_HEIGHT_RATIO = 0.55;

export function InstructionCard({
  step,
  distanceToNextStepM,
  distanceRemainingM,
  progress,
  heading,
  bearing,
  gpsStale = false,
  mode = 'outdoor',
  onAdvanceStep = null,
  onPreviousStep = null,
  canGoBack = false,
  isLastStep = false,
}) {
  const insets = useSafeAreaInsets();
  const { fonts } = useAccessibility();

  const isIndoor = mode === 'indoor';
  const maxCardHeight =
    Dimensions.get('window').height * MAX_CARD_HEIGHT_RATIO;

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
      style={[
        styles.card,
        { paddingBottom: insets.bottom + SPACING.md, maxHeight: maxCardHeight },
      ]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${step.instruction}. ${
        isIndoor ? '' : formatDistance(distanceToNextStepM) + ' to next. '
      }${isIndoor ? '' : formatDistance(distanceRemainingM) + ' remaining.'}`}
    >
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(progress * 100)}%` },
          ]}
        />
      </View>

      {isIndoor ? (
        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>
            {t('walking.indoorsBadge')}
          </Text>
        </View>
      ) : gpsStale ? (
        <View style={styles.gpsStrip}>
          <Text style={styles.gpsText}>{t('walking.searchingGps')}</Text>
        </View>
      ) : null}

      <View style={styles.body}>
        {isIndoor ? (
          <View style={styles.indoorIconBox}>
            <Text style={styles.indoorIconText}>🏛</Text>
          </View>
        ) : (
          <CompassArrow
            heading={heading}
            bearing={bearing}
            distanceM={distanceToNextStepM}
          />
        )}

        <View style={styles.textBlock}>
          {/* No numberOfLines cap: the card grows to fit. The
              maxHeight on the card bounds the growth. */}
          <Text
            style={[styles.instruction, { fontSize: fonts.title }]}
          >
            {step.instruction}
          </Text>

          {!isIndoor ? (
            <View style={styles.meta}>
              <Text style={[styles.metaItem, { fontSize: fonts.small + 1 }]}>
                {formatDistance(distanceToNextStepM)} {t('common.toNext')}
              </Text>
              <Text style={[styles.metaItem, { fontSize: fonts.small + 1 }]}>
                {formatDistance(distanceRemainingM)} {t('common.left')}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {isIndoor && onAdvanceStep ? (
        <View style={styles.advanceRow}>
          {/* Previous takes a quarter of the row, Next three quarters. */}
          {onPreviousStep ? (
            <TouchableOpacity
              style={[
                styles.previousButton,
                !canGoBack && styles.previousButtonDisabled,
              ]}
              onPress={onPreviousStep}
              disabled={!canGoBack}
              accessibilityRole="button"
              accessibilityLabel={t('walking.previousStepButton')}
              accessibilityState={{ disabled: !canGoBack }}
            >
              <Text
                style={styles.previousButtonText}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {t('walking.previousStepButton')}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[
              styles.advanceButton,
              isLastStep && styles.advanceButtonLast,
            ]}
            onPress={onAdvanceStep}
            accessibilityRole="button"
            accessibilityLabel={
              isLastStep
                ? t('walking.arrivedButton')
                : t('walking.nextStepButton')
            }
          >
            <Text style={styles.advanceButtonText}>
              {isLastStep
                ? t('walking.arrivedButton')
                : t('walking.nextStepButton')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    overflow: 'hidden',
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
  modeBadge: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 6,
    backgroundColor: '#eef2ff',
    borderBottomWidth: 1,
    borderBottomColor: '#c7d2fe',
  },
  modeBadgeText: {
    fontSize: 12,
    color: '#3730a3',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  body: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  indoorIconBox: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indoorIconText: {
    fontSize: 40,
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
  advanceRow: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  previousButton: {
    flex: 1,
    backgroundColor: COLORS.primaryTint,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: 4,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previousButtonDisabled: {
    opacity: 0.4,
  },
  previousButtonText: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
  },
  advanceButton: {
    flex: 3,
    backgroundColor: COLORS.primaryDark,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  advanceButtonLast: {
    backgroundColor: '#15803d',
  },
  advanceButtonText: {
    color: '#ffffff',
    fontSize: FONT_SIZE.large,
    fontWeight: '600',
  },
});

