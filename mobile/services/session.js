// Anonymous device identity.
//
// On first launch, generate a random ID and store it in AsyncStorage.
// Every request that needs the device's identity sends it in the
// X-Device-Id header. The backend hashes it before storing, so the
// raw ID never appears in the database.
//
// Consequences of no accounts:
//   - Reinstalling the app generates a new ID, losing favorites
//     and recents.
//   - Clearing app data does the same.
//   - Two devices can't share favorites.
//
// That's the design. No login, no passwords, no privacy burden.

import { getItem, setItem } from '@/services/storage';

const STORAGE_KEY = 'campus-nav-device-id';

let _cached = null;

// Generate a random ID. Uses crypto if available, falls back to
// Math.random for environments where crypto isn't a global.
function _generateDeviceId() {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : null;

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback. Not cryptographically random, but this is a device ID,
  // not a secret. Collision probability is negligible.
  let id = '';
  for (let i = 0; i < 32; i++) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  return id;
}

// Get the device ID, generating and persisting one on first call.
// Cached in memory after the first read so subsequent calls are free.
export async function getDeviceId() {
  if (_cached) return _cached;

  const stored = await getItem(STORAGE_KEY);
  if (stored) {
    _cached = stored;
    return stored;
  }

  const fresh = _generateDeviceId();
  await setItem(STORAGE_KEY, fresh);
  _cached = fresh;
  return fresh;
}