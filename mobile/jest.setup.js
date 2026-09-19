// Jest setup file. Runs before every test.
//
// Puts a fake fetch on the global scope so tests that call the API
// client don't actually hit the network. Individual tests can
// override this via global.fetch = jest.fn().

// Silence the "act(...)" warnings from React 19 that appear even
// when tests don't render anything. These come from internal React
// scheduling, not from our code.
global.IS_REACT_ACT_ENVIRONMENT = false;

// A minimal fetch that returns a rejected promise. Tests that expect
// a fetch call will mock it themselves. Tests that accidentally call
// fetch without mocking will fail loudly instead of trying real
// network I/O.
global.fetch = jest.fn(() =>
  Promise.reject(new Error('fetch was called without a mock'))
);