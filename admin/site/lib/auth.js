// Server-side auth helpers for the admin site's proxy.
//
// The browser stores the JWT in a cookie (set by the login page).
// This module reads that cookie on the server, and forwards the
// token to the backend as a Bearer header.
//
// The ADMIN_API_KEY from Phase 14 is still supported as a fallback
// while the login flow settles in.

import { cookies } from 'next/headers';

const SESSION_COOKIE = 'campus_admin_session';

// ---------- Server-side helpers ----------

/**
 * Read the session token from the request's cookies.
 * Returns null if there's no cookie.
 */
export function getSessionToken() {
  const store = cookies();
  const cookie = store.get(SESSION_COOKIE);
  return cookie ? cookie.value : null;
}

/**
 * Read the Phase 14 fallback key, if configured.
 * Used only if there's no session cookie.
 */
export function getAdminKey() {
  return process.env.ADMIN_API_KEY || null;
}

/**
 * Read the backend URL.
 */
export function getBackendUrl() {
  const url = process.env.BACKEND_URL;
  if (!url) {
    throw new Error(
      'BACKEND_URL is not set. Copy .env.example to .env.local and set it.'
    );
  }
  return url.replace(/\/$/, '');
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;