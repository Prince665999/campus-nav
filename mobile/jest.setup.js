// Jest setup file. Runs before every test.

// React 19 warns about act() during tests that don't render. Silence it.
global.IS_REACT_ACT_ENVIRONMENT = false;

// Mock AsyncStorage. It's a native module and doesn't exist in the
// Jest environment, so tests that import anything which imports
// storage would crash on the import. This in-memory mock is what the
// AsyncStorage docs recommend.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key) => Promise.resolve(store.get(key) ?? null)),
      setItem: jest.fn((key, value) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key) => {
        store.delete(key);
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        store.clear();
        return Promise.resolve();
      }),
    },
  };
});

// Provide a default fetch mock that rejects. Tests that expect a
// fetch call will override this themselves; tests that accidentally
// hit the network fail loudly instead of hanging.
global.fetch = jest.fn(() =>
  Promise.reject(new Error('fetch was called without a mock'))
);