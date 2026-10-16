import { magneticHeadingFromXY, smoothHeading } from '@/utils/heading';

describe('magneticHeadingFromXY', () => {
  test('top edge to north reads 0', () => {
    expect(magneticHeadingFromXY(0, 30)).toBeCloseTo(0, 6);
  });
  test('top edge to east reads 90 (north is on the phone\'s left)', () => {
    expect(magneticHeadingFromXY(-30, 0)).toBeCloseTo(90, 6);
  });
  test('top edge to south reads 180', () => {
    expect(magneticHeadingFromXY(0, -30)).toBeCloseTo(180, 6);
  });
  test('top edge to west reads 270 (north is on the phone\'s right)', () => {
    expect(magneticHeadingFromXY(30, 0)).toBeCloseTo(270, 6);
  });
});

describe('smoothHeading', () => {
  test('first value passes through', () => {
    expect(smoothHeading(null, 123)).toBe(123);
  });
  test('moves part of the way', () => {
    expect(smoothHeading(100, 120, 0.5)).toBeCloseTo(110, 6);
  });
  test('takes the short way round 359 -> 1', () => {
    expect(smoothHeading(350, 10, 0.5)).toBeCloseTo(0, 6);
  });
});
