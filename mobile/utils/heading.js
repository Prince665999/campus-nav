// Pure heading maths, kept apart from the sensors so it can be unit-tested.

// Heading (0 = north, 90 = east) from a raw magnetometer reading, for a phone
// held FLAT with its top edge pointing the way you face.
//
// Device axes: x points to the right edge, y to the top edge. With the top
// edge pointing north, the magnetic field is along +y, so (x=0, y>0) must give
// 0. Pointing east, north is to the phone's left, field along -x, so
// (x<0, y=0) must give 90. That is atan2(-x, y).
//
// (The old code used atan2(y, x), which is 90 degrees off: it said "east"
// while you faced north.)
export function magneticHeadingFromXY(x, y) {
  const deg = (Math.atan2(-x, y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

// Low-pass filter for a heading, correct across the 359 -> 0 wrap-around.
export function smoothHeading(prev, next, factor = 0.25) {
  if (prev === null || prev === undefined) return next;
  let diff = next - prev;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (prev + diff * factor + 360) % 360;
}
