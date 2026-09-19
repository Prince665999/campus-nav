// Jest setup file. Runs before every test.

// Silence React 19's act() environment warning during tests.
global.IS_REACT_ACT_ENVIRONMENT = false;

// Provide a default fetch mock that rejects. Tests that expect a
// fetch call will override this themselves; tests that accidentally
// hit the network fail loudly instead of hanging.
global.fetch = jest.fn(() =>
  Promise.reject(new Error('fetch was called without a mock'))
);