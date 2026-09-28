// One row in the timetable list. Left column is the time, right
// column is the module. If the venue matches a place, the row is
// tappable and opens that place's detail screen.

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { TIMETABLE_COLORS } from '@/constants/timetable';
import { COLORS, FONT_SIZE, RADIUS, SPACING, TOUCH } from '@/constants/theme';

export function TimetableRow({ entry, onPress }) {
  const hasVenuePlace = entry.venue_place_id != null;
  const venueLabel = entry.venue_name || entry.venue_code || null;

  const content = (
    <View style={styles.row}>
      {/* Time column */}
      <View style={styles.timeCol}>
        <Text style={styles.startTime}>{entry.start_time}</Text>
        <Text style={styles.endTime}>{entry.end_time}</Text>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.moduleCode}>{entry.module_code}</Text>
        {entry.module_name ? (
          <Text style={styles.moduleName} numberOfLines={2}>
            {entry.module_name}
          </Text>
        ) : null}
        {entry.lecturer_name ? (
          <Text style={styles.lecturer} numberOfLines={1}>
            {entry.lecturer_name}
          </Text>
        ) : null}
        {venueLabel ? (
          <Text style={styles.venue} numberOfLines={1}>
            {venueLabel}
          </Text>
        ) : null}
      </View>

      {/* Arrow if the row is tappable */}
      {hasVenuePlace ? (
        <MaterialIcons
          name="chevron-right"
          size={22}
          color={COLORS.textMuted}
          style={styles.chevron}
        />
      ) : null}
    </View>
  );

  if (hasVenuePlace) {
    return (
      <TouchableOpacity
        onPress={() => onPress(entry)}
        accessibilityRole="button"
        accessibilityLabel={`${entry.module_code}, ${entry.start_time}. Tap for venue.`}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    minHeight: TOUCH.minHeight,
    borderBottomWidth: 1,
    borderBottomColor: TIMETABLE_COLORS.rowBorder,
    alignItems: 'flex-start',
  },
  timeCol: {
    width: 60,
    marginRight: SPACING.sm,
  },
  startTime: {
    fontSize: FONT_SIZE.body,
    fontWeight: '600',
    color: TIMETABLE_COLORS.timeColumn,
  },
  endTime: {
    fontSize: FONT_SIZE.small,
    color: COLORS.textFaint,
    marginTop: 2,
  },
  body: { flex: 1 },
  moduleCode: {
    fontSize: FONT_SIZE.body + 1,
    fontWeight: '700',
    color: TIMETABLE_COLORS.moduleCode,
  },
  moduleName: {
    fontSize: FONT_SIZE.small,
    color: TIMETABLE_COLORS.moduleName,
    marginTop: 2,
  },
  lecturer: {
    fontSize: FONT_SIZE.small - 1,
    color: TIMETABLE_COLORS.lecturer,
    marginTop: 4,
  },
  venue: {
    fontSize: FONT_SIZE.small,
    color: TIMETABLE_COLORS.venue,
    fontWeight: '600',
    marginTop: 4,
  },
  chevron: {
    alignSelf: 'center',
    marginLeft: SPACING.sm,
  },
});