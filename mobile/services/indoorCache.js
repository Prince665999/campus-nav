// Persistent cache for indoor floor plans.
//
// Floor plans change rarely. Caching them means a student who has
// visited a building before sees its floor plan instantly, even
// without a network connection.
//
// Two-layer cache:
//   - In-memory Map for this session. Fast, no I/O.
//   - AsyncStorage for across-session persistence. Survives restarts.
//
// Every entry has a `cachedAt` timestamp. On read, entries older
// than the TTL are discarded and refetched.
//
// Key format: indoor-cache-v1:<building>:<level>
// Bumping the version prefix invalidates every old entry.

import { getJSON, setJSON } from '@/services/storage';

const KEY_PREFIX = 'indoor-cache-v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const _memory = new Map();

function _key(buildingName, level) {
  return `${KEY_PREFIX}:${buildingName}:${level}`;
}

/**
 * Read a floor plan from the cache. Returns null on miss or on an
 * expired entry.
 */
export async function getCachedFloor(buildingName, level) {
  if (!buildingName || level == null) return null;
  const key = _key(buildingName, level);

  // Memory first — fastest.
  if (_memory.has(key)) {
    const entry = _memory.get(key);
    if (Date.now() - entry.cachedAt < TTL_MS) return entry.data;
    _memory.delete(key);
  }

  // Fall through to storage.
  const stored = await getJSON(key);
  if (!stored || !stored.cachedAt || !stored.data) return null;
  if (Date.now() - stored.cachedAt >= TTL_MS) {
    // Expired. Leave it on disk for now — the next write will
    // overwrite. No need to delete eagerly.
    return null;
  }

  // Warm the memory cache.
  _memory.set(key, stored);
  return stored.data;
}

/**
 * Store a floor plan. Writes to both cache layers.
 */
export async function setCachedFloor(buildingName, level, data) {
  if (!buildingName || level == null) return;
  const key = _key(buildingName, level);
  const entry = { cachedAt: Date.now(), data };

  _memory.set(key, entry);
  // Fire-and-forget. If AsyncStorage fails, the memory cache still
  // works for this session.
  setJSON(key, entry).catch(() => {});
}

/**
 * Clear every cached floor plan. Not currently called from the UI —
 * we may add a "clear cache" button later if it becomes useful.
 */
export async function clearIndoorCache() {
  _memory.clear();
  // AsyncStorage doesn't have a "delete by prefix" call. To clear
  // everything we'd have to know the keys. Since we don't currently
  // expose a clear button, leave it as a stub. The version prefix
  // (indoor-cache-v1) is the real invalidation tool: bump to v2 and
  // every old key becomes unreachable.
}