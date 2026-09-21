// A circular compass with a needle that points at the next turn.
//
// If the device has no magnetometer, or the heading hasn't arrived
// yet, this renders a compass rose without an arrow — showing the
// cardinal directions is still useful for a "head east" instruction.

import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/theme';
import { formatDistance } from '@/utils/format';

export function CompassArrow({ heading, bearing, distanceM, size = 84 }) {
  const hasHeading = heading != null;
  const hasBearing = bearing != null;

  // The compass rose rotates by -heading so that N always points to
  // true north on screen. The arrow rotates by (bearing - heading) so
  // it points at the target relative to the phone's orientation.
  const roseRotation = hasHeading ? -heading : 0;
  const arrowRotation = hasHeading && hasBearing ? bearing - heading : 0;

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      <View style={[styles.circle, { borderRadius: size / 2 }]}>
        {/* The whole rose rotates so N points to true north. */}
        <View
          style={[
            styles.rose,
            { transform: [{ rotate: `${roseRotation}deg` }] },
          ]}
        >
          <Text style={[styles.cardinal, styles.north]}>N</Text>
          <Text style={[styles.cardinal, styles.east]}>E</Text>
          <Text style={[styles.cardinal, styles.south]}>S</Text>
          <Text style={[styles.cardinal, styles.west]}>W</Text>
        </View>

        {/* The arrow rotates independently to point at the target. */}
        {hasHeading && hasBearing ? (
          <View
            style={[
              styles.arrowContainer,
              { transform: [{ rotate: `${arrowRotation}deg` }] },
            ]}
          >
            <View style={styles.arrowHead} />
            <View style={styles.arrowTail} />
          </View>
        ) : (
          <View style={styles.pending}>
            <Text style={styles.pendingText}>···</Text>
          </View>
        )}
      </View>

      {distanceM != null && hasHeading && hasBearing ? (
        <Text style={styles.distance}>{formatDistance(distanceM)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: '100%',
    height: '100%',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  cardinal: {
    position: 'absolute',
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textFaint,
  },
  north: { top: 4 },
  east: { right: 6, top: '45%' },
  south: { bottom: 4 },
  west: { left: 6, top: '45%' },
  arrowContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  arrowHead: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: COLORS.primary,
    position: 'absolute',
    top: '18%',
  },
  arrowTail: {
    width: 8,
    height: 18,
    backgroundColor: COLORS.primary,
    position: 'absolute',
    top: '42%',
    borderRadius: 3,
  },
  pending: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingText: {
    fontSize: 20,
    color: COLORS.textFaint,
    letterSpacing: 2,
  },
  distance: {
    position: 'absolute',
    bottom: -24,
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    overflow: 'hidden',
  },
    rose: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});