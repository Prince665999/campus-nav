// How a place is written in lists.
//
//   formatPlaceName(room)  -> "Room 12 (Computer Lab, ICT Lab)"
//   placeLocationLine(room) -> "Dr. Magufuli Library · First floor"

import { levelLabel } from '@/utils/levelLabel';

/** "Lab A;Computer lab" -> ["Lab A", "Computer lab"] (trimmed, no blanks, no repeats). */
export function parseAltNames(raw) {
  if (!raw) return [];
  const seen = new Set();
  const out = [];
  for (const part of String(raw).split(';')) {
    const name = part.trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/** The place's name, with its alternative names in brackets when it has any. */
export function formatPlaceName(place) {
  const name = (place?.name || '').trim();
  const mainKey = name.toLowerCase();
  const alts = parseAltNames(place?.alt_names).filter(
    (a) => a.toLowerCase() !== mainKey
  );
  return alts.length > 0 ? `${name} (${alts.join(', ')})` : name;
}

/** "Building · Floor", or null when the place has neither (an outdoor place). */
export function placeLocationLine(place) {
  const parts = [
    place?.building_name ? String(place.building_name).trim() : null,
    levelLabel(place?.level),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Everything a student might type to find this place, lower-cased. */
export function searchableText(place) {
  return [
    place?.name,
    place?.alt_names,
    place?.name_sw,
    place?.room_name,
    place?.ref,
    place?.building_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
