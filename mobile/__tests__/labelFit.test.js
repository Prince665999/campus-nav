import { labelMinZoom, sizeAtZoom, textBlockEm } from '@/utils/labelFit';
import { polygonLabelInfo } from '@/utils/polygonLabel';

const opts = {
  latDeg: -8.94,
  minSize: 8,
  maxSize: 11,
  startZoom: 16,
  fullSizeZoom: 19,
  wrapEm: 7,
  fit: 1,
  bandStep: 0.5,
  fromZoom: 15,
  toZoom: 22,
};

describe('sizeAtZoom', () => {
  test('small when zoomed out, full size when zoomed in', () => {
    expect(sizeAtZoom(14, opts)).toBe(8);
    expect(sizeAtZoom(16, opts)).toBe(8);
    expect(sizeAtZoom(17.5, opts)).toBe(9.5);
    expect(sizeAtZoom(19, opts)).toBe(11);
    expect(sizeAtZoom(21, opts)).toBe(11);
  });
});

describe('textBlockEm', () => {
  test('a short name is one line', () => {
    const b = textBlockEm('C-215', 7);
    expect(b.height).toBe(1.2);
  });
  test('a long name wraps onto more lines, and is never wider than the wrap width allows for a word', () => {
    const one = textBlockEm('Computer Laboratory Block', 100);
    const wrapped = textBlockEm('Computer Laboratory Block', 7);
    expect(one.height).toBe(1.2);
    expect(wrapped.height > one.height).toBe(true);
    expect(wrapped.width < one.width).toBe(true);
  });
  test('empty text has no size', () => {
    expect(textBlockEm('   ', 7).width).toBe(0);
  });
});

describe('labelMinZoom', () => {
  test('a bigger room shows its name at a lower zoom than a small one', () => {
    const big = labelMinZoom('C-215', 6, opts);
    const small = labelMinZoom('C-215', 1.5, opts);
    expect(big < small).toBe(true);
  });

  test('a long name needs a higher zoom than a short name in the same room', () => {
    const short = labelMinZoom('C-215', 3, opts);
    const long = labelMinZoom('Postgraduate Computer Laboratory', 3, opts);
    expect(long > short).toBe(true);
  });

  test('the result is a multiple of the band step', () => {
    const z = labelMinZoom('Room 12', 2.2, opts);
    expect((z * 2) % 1).toBe(0);
  });

  test('a name that fits at one zoom fits at every higher zoom', () => {
    const z = labelMinZoom('Staff Common Room', 2, opts);
    expect(z !== null).toBe(true);
    // asking again with a larger room can only lower the zoom, never raise it
    expect(labelMinZoom('Staff Common Room', 2.5, opts) <= z).toBe(true);
  });

  test('a speck of a room, or no name, never shows a name', () => {
    expect(labelMinZoom('X', 0.01, opts)).toBeNull();
    expect(labelMinZoom('', 5, opts)).toBeNull();
    expect(labelMinZoom('Hall', 0, opts)).toBeNull();
  });

  test('fit above 1 shows names sooner, below 1 later', () => {
    const base = labelMinZoom('Lecture Hall 2', 2, opts);
    expect(labelMinZoom('Lecture Hall 2', 2, { ...opts, fit: 1.5 }) <= base).toBe(true);
    expect(labelMinZoom('Lecture Hall 2', 2, { ...opts, fit: 0.6 }) >= base).toBe(true);
  });
});

describe('polygonLabelInfo', () => {
  // A 6 m x 4 m room near the equator: about 0.0000539 deg wide, 0.0000362 deg tall.
  const w = 6 / 111320, h = 4 / 110540;
  const ring = [[0, 0], [w, 0], [w, h], [0, h], [0, 0]];
  test('radius is half the short side, in metres', () => {
    const info = polygonLabelInfo(ring);
    expect(Math.abs(info.radiusM - 2) < 0.02).toBe(true);
    expect(Math.abs(info.point[0] - w / 2) < 1e-9).toBe(true);
  });
  test('nothing for no polygon', () => {
    expect(polygonLabelInfo([])).toBeNull();
  });
});
