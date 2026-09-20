// Tests for utils/geo.js.
//
// The expected values are chosen to match what the Python versions
// in campus_graph.py produce, so drift between the two is caught.

import {
  haversineM,
  bearingDeg,
  pointSegmentInfo,
  snapToRoute,
} from '@/utils/geo';

describe('haversineM', () => {
  test('identical points give zero', () => {
    expect(haversineM(-6.75, 39.2, -6.75, 39.2)).toBeCloseTo(0, 6);
  });

  test('one degree of latitude is about 111 km', () => {
    const d = haversineM(0, 0, 1, 0);
    expect(d).toBeGreaterThan(111000);
    expect(d).toBeLessThan(111500);
  });

  test('campus-scale distance is roughly 55 metres for 0.0005 deg lat', () => {
    const d = haversineM(-6.75, 39.2, -6.7495, 39.2);
    expect(d).toBeCloseTo(55.6, 0);
  });

  test('is symmetric', () => {
    const d1 = haversineM(-6.75, 39.2, -6.749, 39.2005);
    const d2 = haversineM(-6.749, 39.2005, -6.75, 39.2);
    expect(d1).toBeCloseTo(d2, 6);
  });
});

describe('bearingDeg', () => {
  test('due north is 0', () => {
    expect(bearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 1);
  });

  test('due east is 90', () => {
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 1);
  });

  test('due south is 180', () => {
    expect(bearingDeg(1, 0, 0, 0)).toBeCloseTo(180, 1);
  });

  test('due west is 270', () => {
    expect(bearingDeg(0, 1, 0, 0)).toBeCloseTo(270, 1);
  });

  test('always returns a value in [0, 360)', () => {
    for (const [la1, lo1, la2, lo2] of [
      [-6.75, 39.2, -6.74, 39.19],
      [-6.75, 39.2, -6.76, 39.21],
      [-6.75, 39.2, -6.75, 39.19],
      [-6.75, 39.2, -6.75, 39.21],
    ]) {
      const b = bearingDeg(la1, lo1, la2, lo2);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });
});

describe('pointSegmentInfo', () => {
  test('point on the segment has zero distance', () => {
    const p = [-6.7495, 39.2];
    const a = [-6.75, 39.2];
    const b = [-6.749, 39.2];
    const info = pointSegmentInfo(p, a, b);
    expect(info.distance).toBeCloseTo(0, 0);
    expect(info.t).toBeCloseTo(0.5, 2);
  });

  test('point east of a north-running segment is on the right', () => {
    const p = [-6.7495, 39.2001];
    const a = [-6.75, 39.2];
    const b = [-6.749, 39.2];
    const info = pointSegmentInfo(p, a, b);
    expect(info.distance).toBeGreaterThan(5);
    expect(info.distance).toBeLessThan(20);
    expect(info.side).toBe('right');
  });

  test('point west of a north-running segment is on the left', () => {
    const p = [-6.7495, 39.1999];
    const a = [-6.75, 39.2];
    const b = [-6.749, 39.2];
    const info = pointSegmentInfo(p, a, b);
    expect(info.side).toBe('left');
  });

  test('point before the segment clamps to t = 0', () => {
    const p = [-6.751, 39.2];
    const a = [-6.75, 39.2];
    const b = [-6.749, 39.2];
    const info = pointSegmentInfo(p, a, b);
    expect(info.t).toBe(0);
  });

  test('point after the segment clamps to t = 1', () => {
    const p = [-6.748, 39.2];
    const a = [-6.75, 39.2];
    const b = [-6.749, 39.2];
    const info = pointSegmentInfo(p, a, b);
    expect(info.t).toBe(1);
  });
});

describe('snapToRoute', () => {
  const route = [
    { lat: -6.75, lon: 39.2 },
    { lat: -6.7495, lon: 39.2 },
    { lat: -6.749, lon: 39.2 },
  ];

  test('a point on the route snaps to itself', () => {
    const snapped = snapToRoute({ lat: -6.7495, lon: 39.2 }, route);
    expect(snapped).not.toBeNull();
    expect(snapped.offRouteM).toBeCloseTo(0, 0);
    expect(snapped.distanceFromStartM).toBeGreaterThan(0);
  });

  test('a point off to the side snaps onto the route', () => {
    const snapped = snapToRoute({ lat: -6.7495, lon: 39.2001 }, route);
    expect(snapped).not.toBeNull();
    expect(snapped.offRouteM).toBeGreaterThan(5);
    expect(snapped.offRouteM).toBeLessThan(20);
    // The snapped point should be on the line, so at lon 39.2.
    expect(snapped.lon).toBeCloseTo(39.2, 4);
  });

  test('a point before the route snaps to the start', () => {
    const snapped = snapToRoute({ lat: -6.751, lon: 39.2 }, route);
    expect(snapped).not.toBeNull();
    expect(snapped.distanceFromStartM).toBeCloseTo(0, 0);
  });

  test('returns null for an empty route', () => {
    expect(snapToRoute({ lat: -6.75, lon: 39.2 }, [])).toBeNull();
  });

  test('handles a single-point route', () => {
    const snapped = snapToRoute({ lat: -6.75, lon: 39.2 }, [
      { lat: -6.75, lon: 39.2 },
    ]);
    expect(snapped).not.toBeNull();
    expect(snapped.distanceFromStartM).toBe(0);
  });
});