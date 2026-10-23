import { polygonLabelPoint } from '@/utils/polygonLabel';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

describe('polygonLabelPoint', () => {
  test('the middle of a square', () => {
    const p = polygonLabelPoint([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]);
    expect(near(p[0], 2 / 2) && near(p[1], 1)).toBe(true);
  });

  test('works with or without the closing point', () => {
    const open = polygonLabelPoint([[0, 0], [4, 0], [4, 2], [0, 2]]);
    const closed = polygonLabelPoint([[0, 0], [4, 0], [4, 2], [0, 2], [0, 0]]);
    expect(near(open[0], closed[0]) && near(open[1], closed[1])).toBe(true);
    expect(near(open[0], 2) && near(open[1], 1)).toBe(true);
  });

  test('a slanted room is centred on the room, not on its bounding box', () => {
    // A parallelogram: its centre of mass is (3, 1), the middle of its diagonals.
    const p = polygonLabelPoint([[0, 0], [4, 0], [6, 2], [2, 2]]);
    expect(near(p[0], 3) && near(p[1], 1)).toBe(true);
  });

  test('the same shape rotated gives the same place', () => {
    const rot = (pts, deg) => {
      const r = (deg * Math.PI) / 180;
      return pts.map(([x, y]) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]);
    };
    const base = [[0, 0], [6, 0], [6, 2], [0, 2]];
    const a = polygonLabelPoint(rot(base, 0));
    const b = polygonLabelPoint(rot(base, 37));
    const centre = rot([[3, 1]], 37)[0];
    expect(near(a[0], 3, 1e-6) && near(a[1], 1, 1e-6)).toBe(true);
    // a tiny flattening difference is allowed because lat/lon are scaled
    expect(Math.abs(b[0] - centre[0]) < 0.02 && Math.abs(b[1] - centre[1]) < 0.02).toBe(true);
  });

  test('a U-shaped room: the point is inside the room, not in the notch', () => {
    // U opening upwards; its centre of mass lies in the empty notch.
    const u = [[0, 0], [9, 0], [9, 9], [6, 9], [6, 3], [3, 3], [3, 9], [0, 9]];
    const p = polygonLabelPoint(u);
    // inside the base (y < 3) or one of the arms (x < 3 or x > 6), never in the notch
    const inBase = p[1] > 0 && p[1] < 3;
    const inLeftArm = p[0] > 0 && p[0] < 3 && p[1] < 9;
    const inRightArm = p[0] > 6 && p[0] < 9 && p[1] < 9;
    expect(inBase || inLeftArm || inRightArm).toBe(true);
  });

  test('degenerate input does not crash', () => {
    expect(polygonLabelPoint([])).toBeNull();
    expect(polygonLabelPoint(null)).toBeNull();
    expect(polygonLabelPoint([[1, 1]])).toEqual([1, 1]);
    const line = polygonLabelPoint([[0, 0], [2, 0], [4, 0]]);
    expect(near(line[0], 2) && near(line[1], 0)).toBe(true);
  });
});
