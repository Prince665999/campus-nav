// Turns the floor number stored in the map ("0", "1", "-1") into the words a
// student understands: Ground floor, First floor, Basement.
//
// Used everywhere a floor is shown in text: the door picker, search results,
// the rooms-in-a-building list. (The little floor buttons on the map keep
// their compact G / 1 / 2 labels.)

import { t } from '@/i18n';

const ORDINAL_KEYS = [
  'ground', // 0
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
];

/**
 * levelLabel("0")  -> "Ground floor"
 * levelLabel("1")  -> "First floor"
 * levelLabel("-1") -> "Basement"
 * levelLabel("-2") -> "Basement 2"
 * levelLabel("11") -> "Floor 11"
 * levelLabel("M")  -> "M"            (anything that is not a number is shown as typed)
 * levelLabel(null) -> null
 */
export function levelLabel(level) {
  if (level === null || level === undefined) return null;

  // A stair or room on two floors is stored as "0;1". Show the first.
  const text = String(level).split(';')[0].trim();
  if (!text) return null;

  if (!/^-?\d+$/.test(text)) return text;
  const n = Number(text);

  if (n === -1) return t('level.basement');
  if (n < -1) return t('level.basementN', { n: -n });
  if (n < ORDINAL_KEYS.length) return t(`level.${ORDINAL_KEYS[n]}`);
  return t('level.number', { n });
}
