// App-wide configuration read from environment variables.
//
// Expo makes any variable prefixed with EXPO_PUBLIC_ available at
// build time, so these values are baked into the app bundle when it's
// built. That's fine for the API URL — it's not a secret.

const DEFAULT_API_BASE_URL = 'http://192.168.43.204:8000';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;

// How long to wait for an API response before giving up.
export const API_TIMEOUT_MS = 15000;

// Debounce window for the search bar, in milliseconds.
export const SEARCH_DEBOUNCE_MS = 300;

// How many search results to display.
export const SEARCH_RESULT_LIMIT = 20;