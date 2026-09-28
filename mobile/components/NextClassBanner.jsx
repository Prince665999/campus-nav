// The banner that appears at the top of Home when a class is coming
// up in the next 90 minutes. Hidden entirely when there's no class.

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { t } from '@/i18n';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';

function formatStartsIn(seconds) {
  if (seconds < 60) {
    return t('timetable.banner.startingNow');
  }
  const minutes = Math.round(seconds / 60);
  return t('timetable.banner.startsIn', { minutes });
}

export function NextClassBanner({ entry, startsInSeconds, onNavigate, onViewTimetable }) {
  if (!entry) return null;

  const venueLabel = entry.venue_name || entry.venue_code || null;
  const hasVenuePlace = entry.venue_place_id != null;

  return (
    <View style={styles.banner}>
      <View style={styles.topRow}>
        <MaterialIcons name="schedule" size={20} color="#78350f" />
        <Text style={styles.when}>
          {formatStartsIn(startsInSeconds)}
        </Text>
      </View>

      <Text style={styles.module} numberOfLines={2}>
        {entry.module_code}
        {entry.module_name ? ` · ${entry.module_name}` : ''}
      </Text>

      <Text style={styles.detail} numberOfLines={1}>
        {entry.start_time}–{entry.end_time}
        {venueLabel ? ` · ${venueLabel}` : ''}
      </Text>

      <View style={styles.actions}>
        {hasVenuePlace ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => onNavigate(entry)}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>
              {t('timetable.banner.takeMeThere')}
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onViewTimetable}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>
            {t('timetable.banner.viewTimetable')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  when: {
    fontSize: FONT_SIZE.small,
    fontWeight: '700',
    color: '#78350f',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  module: {
    fontSize: FONT_SIZE.body + 1,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  detail: {
    fontSize: FONT_SIZE.small,
    color: '#374151',
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#b45309',
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  secondaryButtonText: {
    color: '#78350f',
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
  },
});