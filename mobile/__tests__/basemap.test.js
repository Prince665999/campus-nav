// The base map loader: server, saved copy, and what happens offline.

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k) => (k in store ? store[k] : null)),
      setItem: jest.fn(async (k, v) => {
        store[k] = v;
      }),
      __store: store,
    },
  };
});

jest.mock('@/services/api', () => ({
  getBaseMap: jest.fn(),
  getBaseMapVersion: jest.fn(),
}));

const map = (version, extra = {}) => ({
  version,
  bounds: [0, 0, 1, 1],
  layers: { buildings: { type: 'FeatureCollection', features: [] } },
  ...extra,
});

let api, storage, loadBaseMap;

beforeEach(() => {
  jest.resetModules(); // the loader keeps a copy in memory, so start fresh
  api = require('@/services/api');
  storage = require('@react-native-async-storage/async-storage').default;
  Object.keys(storage.__store).forEach((k) => delete storage.__store[k]);
  ({ loadBaseMap } = require('@/services/basemap'));
});

test('downloads the map and saves it when nothing is saved yet', async () => {
  api.getBaseMap.mockResolvedValue(map('v1'));
  const result = await loadBaseMap();
  expect(result.version).toBe('v1');
  expect(api.getBaseMapVersion).not.toHaveBeenCalled(); // nothing saved to compare
  expect(JSON.parse(storage.__store['basemap-cache-v1']).version).toBe('v1');
});

test('uses the saved copy when the server says the version is the same', async () => {
  storage.__store['basemap-cache-v1'] = JSON.stringify(map('v1'));
  api.getBaseMapVersion.mockResolvedValue({ version: 'v1' });
  const result = await loadBaseMap();
  expect(result.version).toBe('v1');
  expect(api.getBaseMap).not.toHaveBeenCalled(); // no download
});

test('downloads again when the map was updated', async () => {
  storage.__store['basemap-cache-v1'] = JSON.stringify(map('v1'));
  api.getBaseMapVersion.mockResolvedValue({ version: 'v2' });
  api.getBaseMap.mockResolvedValue(map('v2'));
  const result = await loadBaseMap();
  expect(result.version).toBe('v2');
  expect(JSON.parse(storage.__store['basemap-cache-v1']).version).toBe('v2');
});

test('offline with a saved copy: uses the saved copy', async () => {
  storage.__store['basemap-cache-v1'] = JSON.stringify(map('v1'));
  api.getBaseMapVersion.mockRejectedValue(new Error('Network request failed'));
  const result = await loadBaseMap();
  expect(result.version).toBe('v1');
});

test('offline with nothing saved: null, so the app falls back to the online map', async () => {
  api.getBaseMap.mockRejectedValue(new Error('Network request failed'));
  expect(await loadBaseMap()).toBeNull();
});

test('a server without a map file: null', async () => {
  api.getBaseMap.mockRejectedValue(new Error('The map file (map.osm) was not found'));
  expect(await loadBaseMap()).toBeNull();
});

test('a damaged saved copy is ignored', async () => {
  storage.__store['basemap-cache-v1'] = '{not json';
  api.getBaseMap.mockResolvedValue(map('v3'));
  expect((await loadBaseMap()).version).toBe('v3');
});

test('the second call in a session does not touch the network', async () => {
  api.getBaseMap.mockResolvedValue(map('v1'));
  await loadBaseMap();
  await loadBaseMap();
  expect(api.getBaseMap).toHaveBeenCalledTimes(1);
});

test('two screens asking at once share one request', async () => {
  api.getBaseMap.mockResolvedValue(map('v1'));
  await Promise.all([loadBaseMap(), loadBaseMap()]);
  expect(api.getBaseMap).toHaveBeenCalledTimes(1);
});

test('a map too big to save safely is used but not saved', async () => {
  const big = map('big', { padding: 'x'.repeat(1_600_000) });
  api.getBaseMap.mockResolvedValue(big);
  const result = await loadBaseMap();
  expect(result.version).toBe('big');
  expect(storage.setItem).not.toHaveBeenCalled();
});
