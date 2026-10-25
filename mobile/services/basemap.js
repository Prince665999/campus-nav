// Loads the outdoor base map from the server and keeps a copy on the phone.
//
// Order of events:
//   1. Use the copy already in memory (opened a map earlier this session).
//   2. Otherwise read the saved copy from the phone.
//   3. Ask the server only for the version number. Same version = use the
//      saved copy, no download. Different (the map was updated) = download.
//   4. No network? Use the saved copy. No saved copy either? Return null and
//      the map falls back to the online map picture.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { getBaseMap, getBaseMapVersion } from '@/services/api';

const KEY = 'basemap-cache-v1';
// Android reads each saved value through a ~2 MB window. A campus map is a
// few hundred KB; this guard just stops us saving something too big to read.
const MAX_SAVED_CHARS = 1_500_000;

let memory = null;
let inflight = null;

async function readSaved() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : null;
    return saved && saved.layers ? saved : null;
  } catch {
    return null;
  }
}

async function load() {
  const saved = await readSaved();
  try {
    if (saved) {
      const { version } = await getBaseMapVersion();
      if (version === saved.version) return saved;
    }
    const fresh = await getBaseMap();
    if (fresh && fresh.layers) {
      const text = JSON.stringify(fresh);
      if (text.length <= MAX_SAVED_CHARS) {
        AsyncStorage.setItem(KEY, text).catch(() => {});
      }
      return fresh;
    }
  } catch {
    // Offline, or the server has no map file: fall through to the saved copy.
  }
  return saved;
}

/** The base map, or null if there is none to be had. Never throws. */
export function loadBaseMap() {
  if (memory) return Promise.resolve(memory);
  if (!inflight) {
    inflight = load()
      .then((data) => {
        memory = data;
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
