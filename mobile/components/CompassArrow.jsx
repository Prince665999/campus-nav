// A compass rose with a needle pointing at the next turn.
//
// The whole rose rotates so the N letter always points to true north
// on screen. The arrow rotates separately to point at the target.
//
// This is the correct design: the letters tell you where north is
// relative to the phone's frame, and the arrow tells you which way
// to walk. The two rotate independently.

import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/theme';
import { formatDistance } from '@/utils/format';

export function CompassArrow({ heading, bearing, distanceM, size = 84 }) {
  const hasHeading = heading != null;
  const hasBearing = bearing != null;

  // The rose rotates by -heading so that "N" on the rose always
  // points toward true north on the phone's screen.
  //
  // If the phone is facing north (heading = 0), N is at the top.
  // If the phone is facing east (heading = 90), N is on the left,
  // because north is now to the phone's left.
  const roseRotation = hasHeading ? -heading : 0;

  // The arrow rotates by (bearing - heading) to point at the target
  // relative to the phone's orientation.
  //
  // If the phone is facing north (0) and the target is east (90),
  // the arrow points 90° clockwise.
  // If the phone is facing east (90) and the target is north (0),
  // the arrow points 90° counter-clockwise.
  const arrowRotation = hasHeading && hasBearing ? bearing - heading : 0;

  return (
    <View
      style={[styles.wrapper, { width: size, height: size }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        hasHeading && hasBearing
          ? `Compass. Next turn ${Math.round(distanceM || 0)} metres away.`
          : 'Compass. Waiting for a direction.'
      }
    >
      <View style={[styles.circle, { borderRadius: size / 2 }]}>
        {/* The compass rose — letters rotate so N points to true north. */}
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

        {/* The arrow — rotates independently to point at the target. */}
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
  rose: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardinal: {
    position: 'absolute',
    fontSize: 11,
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
});