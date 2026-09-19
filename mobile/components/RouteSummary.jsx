// Compact summary of a route: distance, estimated time, from/to.

import { StyleSheet, Text, View } from 'react-native';
import { formatDistance, formatDuration } from '@/utils/format';

export function RouteSummary({ fromName, toName, distanceM, durationSeconds }) {
  return (
    <View style={styles.container}>
      <Text style={styles.fromTo} numberOfLines={2}>
        {fromName} → {toName}
      </Text>
      <Text style={styles.meta}>
        {formatDistance(distanceM)} · {formatDuration(durationSeconds)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  fromTo: { fontSize: 17, fontWeight: '600', color: '#111827' },
  meta: { fontSize: 14, color: '#6b7280', marginTop: 6 },
});