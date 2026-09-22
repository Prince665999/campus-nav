// Client-side helpers for the interim admin auth.
//
// Phase 14 uses a shared-secret guard: the admin site's server-side
// proxy attaches an ADMIN_API_KEY header to every backend request,
// and the backend checks it. The browser never sees the key.
//
// Phase 17 replaces this with real JWT login. When that happens,
// this file gains session-token helpers and the proxy route gains a
// session check. The pages themselves don't change.

// ---------- Server-side helper ----------

/**
 * Read the admin key from the environment.
 *
 * Only callable from server-side code (Server Components, API routes,
 * Server Actions). Throws if called from the browser, because
 * NEXT_PUBLIC_* is intentionally not used here — the key must never
 * reach the client.
 */
export function getAdminKey() {
  const key = process.env.ADMIN_API_KEY;
  if (!key) {
    throw new Error(
      'ADMIN_API_KEY is not set. Copy .env.example to .env.local and set it.'
    );
  }
  return key;
}

/**
 * Read the backend URL from the environment. Also server-only.
 */
export function getBackendUrl() {
  const url = process.env.BACKEND_URL;
  if (!url) {
    throw new Error(
      'BACKEND_URL is not set. Copy .env.example to .env.local and set it.'
    );
  }
  return url.replace(/\/$/, ''); // strip trailing slash
}