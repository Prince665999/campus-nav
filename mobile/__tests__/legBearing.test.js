import { headingAlongRoute, legBearing } from '@/utils/legBearing';
import { headingLabel } from '@/utils/headingLabel';

// A point `eastM` metres east and `northM` metres north of a start (near -8.94 S).
const P = (eastM, northM) => ({
  lat: -8.94 + northM / 110540,
  lon: 33.41 + eastM / (111320 * Math.cos((8.94 * Math.PI) / 180)),
});
const near = (a, b, tol) => Math.abs(((a - b + 540) % 360) - 180) <= tol;

describe('legBearing', () => {
  test('a straight road east is 90', () => {
    expect(near(legBearing([P(0, 0), P(5, 0), P(12, 0), P(20, 0)]), 90, 1)).toBe(true);
  });

  test('a diagonal road (not on a compass point) keeps its real angle', () => {
    // 30 degrees east of north
    const d = (m) => P(m * Math.sin(Math.PI / 6), m * Math.cos(Math.PI / 6));
    expect(near(legBearing([d(0), d(6), d(14), d(25)]), 30, 1)).toBe(true);
  });

  test('small zig-zags along a straight road do not matter', () => {
    const pts = [P(0, 0), P(2.5, 0.4), P(5, -0.3), P(8, 0.3), P(11, -0.2), P(15, 0)];
    expect(near(legBearing(pts), 90, 5)).toBe(true);
  });

  test('it stops at a corner: the leg is the part before the turn', () => {
    // 12 m east, then 12 m north
    const pts = [P(0, 0), P(6, 0), P(12, 0), P(12, 6), P(12, 12)];
    expect(near(legBearing(pts), 90, 8)).toBe(true);
  });

  test('a first piece shorter than 3 m is ignored, like before', () => {
    expect(near(legBearing([P(0, 0), P(1, 0), P(8, 0)]), 90, 1)).toBe(true);
  });

  test('no usable direction at the very end of the route', () => {
    expect(legBearing([P(0, 0)])).toBeNull();
    expect(legBearing([P(0, 0), P(1, 0)])).toBeNull();
    expect(legBearing(null)).toBeNull();
  });

  test('a gentle curve is followed for a while', () => {
    // quarter circle of radius 30 m, from heading north towards east
    const pts = [];
    for (let a = 0; a <= 90; a += 6) {
      const r = (a * Math.PI) / 180;
      pts.push(P(30 - 30 * Math.cos(r), 30 * Math.sin(r)));
    }
    const b = legBearing(pts);
    expect(b > 5 && b < 60).toBe(true); // turned towards east, but not all the way
  });
});

describe('headingLabel', () => {
  test('90 and 45 give the 8 compass points', () => {
    expect(headingLabel(0, 90)).toBe('N');
    expect(headingLabel(45, 45)).toBe('NE');
    expect(headingLabel(180, 45)).toBe('S');
    expect(headingLabel(315, 45)).toBe('NW');
  });
  test('22.5 gives 16 directions', () => {
    expect(headingLabel(22.5, 22.5)).toBe('NNE');
    expect(headingLabel(67.5, 22.5)).toBe('ENE');
    expect(headingLabel(202.5, 22.5)).toBe('SSW');
  });
  test('0 (exact) shows the real angle', () => {
    expect(headingLabel(137.4, 0)).toBe('137°');
    expect(headingLabel(359.7, 0)).toBe('0°');
    expect(headingLabel(0, undefined)).toBe('0°');
  });
});


// Geometry for a point at a bearing (degrees) and distance (metres) from another.
const go = (p, bearingDegrees, metres) => {
  const r = (bearingDegrees * Math.PI) / 180;
  return {
    lat: p.lat + (metres * Math.cos(r)) / 110540,
    lon: p.lon + (metres * Math.sin(r)) / (111320 * Math.cos((8.94 * Math.PI) / 180)),
  };
};

describe('headingAlongRoute: the start of a route', () => {
  // Standing at a room door: a 2 m stub east into the corridor, then a
  // corridor that runs at 300 degrees. The first step faces the first leg the
  // walker actually takes, which is the stub (east, 90).
  const door = P(0, 0);
  const corridorStart = go(door, 90, 2);
  const corridor = [corridorStart, go(corridorStart, 300, 3), go(corridorStart, 300, 14), go(corridorStart, 300, 26)];
  const route = [door, ...corridor];

  test('the first step faces the first real leg: the door stub', () => {
    expect(near(headingAlongRoute(route, { isRouteStart: true }), 90, 2)).toBe(true);
  });

  test('a 3 m stub is faced too, not the corridor beyond it', () => {
    const stubEnd = go(door, 90, 3.2);
    const longStub = [door, stubEnd, go(stubEnd, 300, 12), go(stubEnd, 300, 24)];
    expect(near(headingAlongRoute(longStub, { isRouteStart: true }), 90, 2)).toBe(true);
  });

  test('later steps (not the start) still follow the road ahead', () => {
    expect(near(headingAlongRoute(corridor, { isRouteStart: false }), 300, 2)).toBe(true);
  });

  test('a first leg that is long is followed to its end', () => {
    const long = [door, go(door, 90, 9), go(go(door, 90, 9), 0, 8), go(go(door, 90, 9), 0, 16)];
    expect(near(headingAlongRoute(long, { isRouteStart: true }), 90, 3)).toBe(true);
  });

  test('a start with no stub is unchanged', () => {
    const straight = [door, go(door, 45, 6), go(door, 45, 14), go(door, 45, 22)];
    expect(near(headingAlongRoute(straight, { isRouteStart: true }), 45, 1)).toBe(true);
  });

  test('duplicate points at the very start are skipped', () => {
    const doubled = [door, { ...door }, go(door, 120, 6), go(door, 120, 14)];
    expect(near(headingAlongRoute(doubled, { isRouteStart: true }), 120, 1)).toBe(true);
  });

  test('a leg with a gentle bend is followed up to a real turn', () => {
    const start = P(0, 0);
    const pts = [start, go(start, 80, 5), go(go(start, 80, 5), 95, 5), go(go(go(start, 80, 5), 95, 5), 0, 8)];
    const h = headingAlongRoute(pts, { isRouteStart: true });
    expect(h > 80 && h < 95).toBe(true);
  });
});

describe('headingAlongRoute: the end of a route', () => {
  test('on the last turn, the map faces the destination door', () => {
    // At the corridor, the door is 2 m to the west
    const here = P(0, 0);
    expect(near(headingAlongRoute([here, go(here, 270, 2)]), 270, 1)).toBe(true);
  });

  test('a stub with a small kink still faces the door', () => {
    const here = P(0, 0);
    const mid = go(here, 270, 1);
    expect(near(headingAlongRoute([here, { lat: mid.lat + 0.1 / 110540, lon: mid.lon }, go(here, 270, 2)]), 270, 6)).toBe(true);
  });

  test('already at the destination: no direction, so the heading is kept', () => {
    expect(headingAlongRoute([P(0, 0)])).toBeNull();
    expect(headingAlongRoute([P(0, 0), P(0.2, 0)])).toBeNull();
  });
});
