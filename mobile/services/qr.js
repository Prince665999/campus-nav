// Starting a route from a scanned QR code.
//
// A QR code stands for a spot on a corridor. This looks the code up on the
// server and stores that spot as the shared starting point, exactly as if the
// student had chosen it from the "From:" picker. Everything after that is the
// normal flow: pick a destination, tap Directions, and the route starts there.

import { getPlaceByQr } from '@/services/api';
import { setStart } from '@/services/startStore';
import { parseQrCode } from '@/utils/qrCode';

/**
 * Resolve a scanned/typed code and make it the starting point.
 * Returns the chosen start. On failure throws an Error whose `reason` is
 * 'invalid' (not one of our codes), 'unknown' (the server has no such
 * code) or 'network'.
 */
export async function startFromQr(raw) {
  const code = parseQrCode(raw);
  if (!code) {
    const err = new Error('Not a valid code');
    err.reason = 'invalid';
    throw err;
  }

  let place;
  try {
    place = await getPlaceByQr(code);
  } catch (e) {
    const err = new Error(e?.message || 'Lookup failed');
    err.reason = /not found/i.test(err.message) ? 'unknown' : 'network';
    throw err;
  }

  const chosen = {
    placeId: place.id,
    placeName: place.name,
    buildingName: place.building_name || null,
    level: place.level || null,
    lat: place.location?.lat ?? null,
    lon: place.location?.lon ?? null,
    fromQr: code,
  };
  setStart(chosen);
  return chosen;
}
