// The i18n module is replaced by a tiny stand-in so these tests check only
// the logic in levelLabel and placeLabel.
jest.mock('@/i18n', () => ({
  t: (key, params) =>
    params ? `${key}:${Object.values(params).join(',')}` : key,
}));

import { levelLabel } from '@/utils/levelLabel';
import {
  formatPlaceName,
  parseAltNames,
  placeLocationLine,
  searchableText,
} from '@/utils/placeLabel';

describe('levelLabel', () => {
  test('names the common floors', () => {
    expect(levelLabel('-1')).toBe('level.basement');
    expect(levelLabel('0')).toBe('level.ground');
    expect(levelLabel('1')).toBe('level.first');
    expect(levelLabel('2')).toBe('level.second');
    expect(levelLabel(3)).toBe('level.third');
    expect(levelLabel('10')).toBe('level.tenth');
  });

  test('deeper basements and very tall buildings', () => {
    expect(levelLabel('-2')).toBe('level.basementN:2');
    expect(levelLabel('11')).toBe('level.number:11');
  });

  test('a stair on two floors shows the first', () => {
    expect(levelLabel('0;1')).toBe('level.ground');
  });

  test('anything else is shown as typed, and nothing gives null', () => {
    expect(levelLabel('M')).toBe('M');
    expect(levelLabel(null)).toBeNull();
    expect(levelLabel(undefined)).toBeNull();
    expect(levelLabel('  ')).toBeNull();
  });
});

describe('formatPlaceName', () => {
  test('puts the alternative names in brackets', () => {
    expect(formatPlaceName({ name: 'Room 12', alt_names: 'Computer Lab;ICT Lab' })).toBe(
      'Room 12 (Computer Lab, ICT Lab)'
    );
  });

  test('plain name when there is none', () => {
    expect(formatPlaceName({ name: 'Room 12' })).toBe('Room 12');
    expect(formatPlaceName({ name: 'Room 12', alt_names: '' })).toBe('Room 12');
    expect(formatPlaceName({ name: 'Room 12', alt_names: ' ; ' })).toBe('Room 12');
  });

  test('ignores a repeat of the main name and duplicates', () => {
    expect(formatPlaceName({ name: 'Library', alt_names: 'library; Reading Room; reading room' })).toBe(
      'Library (Reading Room)'
    );
  });

  test('copes with a missing place', () => {
    expect(formatPlaceName(null)).toBe('');
  });
});

describe('placeLocationLine', () => {
  test('building and floor', () => {
    expect(placeLocationLine({ building_name: 'Library', level: '1' })).toBe(
      'Library · level.first'
    );
  });
  test('either one alone, or none', () => {
    expect(placeLocationLine({ building_name: 'Library' })).toBe('Library');
    expect(placeLocationLine({ level: '0' })).toBe('level.ground');
    expect(placeLocationLine({})).toBeNull();
  });
});

test('searchableText includes alternative names', () => {
  expect(searchableText({ name: 'Room 12', alt_names: 'ICT Lab', building_name: 'Library' })).toContain('ict lab');
});
