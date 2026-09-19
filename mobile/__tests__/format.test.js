// Tests for utils/format.js.

import {
  roundDistance,
  formatDistance,
  formatDuration,
  estimateWalkingSeconds,
  WALKING_SPEED_M_PER_S,
} from '@/utils/format';

describe('roundDistance', () => {
  test('under 10 metres rounds to the nearest metre', () => {
    expect(roundDistance(4.2)).toBe(4);
    expect(roundDistance(8.7)).toBe(9);
    expect(roundDistance(9.4)).toBe(9);
  });

  test('between 10 and 100 metres rounds to the nearest 5', () => {
    expect(roundDistance(12)).toBe(10);
    expect(roundDistance(23)).toBe(25);
    expect(roundDistance(47)).toBe(45);
    expect(roundDistance(98)).toBe(100);
  });

  test('over 100 metres rounds to the nearest 10', () => {
    expect(roundDistance(104)).toBe(100);
    expect(roundDistance(276)).toBe(280);
    expect(roundDistance(1499)).toBe(1500);
  });

  test('exactly 10 and 100 follow the right rule', () => {
    expect(roundDistance(10)).toBe(10);
    expect(roundDistance(100)).toBe(100);
  });
});

describe('formatDistance', () => {
  test('under a kilometre shows metres', () => {
    expect(formatDistance(45)).toBe('45 m');
    expect(formatDistance(280)).toBe('280 m');
    expect(formatDistance(950)).toBe('950 m');
  });

  test('one kilometre and over shows km with one decimal', () => {
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(1250)).toBe('1.3 km');
    expect(formatDistance(5230)).toBe('5.2 km');
  });

  test('rounding applies before unit conversion', () => {
    // 104 rounds to 100 in roundDistance, so it reads "100 m".
    expect(formatDistance(104)).toBe('100 m');
  });
});

describe('formatDuration', () => {
  test('under a minute shows "< 1 min"', () => {
    expect(formatDuration(30)).toBe('< 1 min');
    expect(formatDuration(59)).toBe('< 1 min');
  });

  test('under an hour shows minutes', () => {
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(300)).toBe('5 min');
    expect(formatDuration(1800)).toBe('30 min');
  });

  test('one hour exactly shows "1 hr"', () => {
    expect(formatDuration(3600)).toBe('1 hr');
    expect(formatDuration(7200)).toBe('2 hr');
  });

  test('over an hour shows hours and minutes', () => {
    expect(formatDuration(3660)).toBe('1 hr 1 min');
    expect(formatDuration(5460)).toBe('1 hr 31 min');
    expect(formatDuration(8100)).toBe('2 hr 15 min');
  });
});

describe('estimateWalkingSeconds', () => {
  test('uses the module walking speed constant', () => {
    const metres = 100;
    expect(estimateWalkingSeconds(metres)).toBe(metres / WALKING_SPEED_M_PER_S);
  });

  test('zero distance gives zero seconds', () => {
    expect(estimateWalkingSeconds(0)).toBe(0);
  });
});