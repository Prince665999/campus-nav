// The API client. Every network call goes through here.
//
// Every function returns a Promise. Errors are thrown with a message
// the UI can show directly.

import { API_BASE_URL, API_TIMEOUT_MS } from '@/constants/config';

async function request(path, options = {}) {
  const url = API_BASE_URL + path;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      // The API returns {detail, code} on errors. Try to read it.
      let detail = `Request failed (${response.status})`;
      try {
        const body = await response.json();
        if (body && body.detail) detail = body.detail;
      } catch (_ignored) {
        // Response wasn't JSON. Keep the generic message.
      }
      throw new Error(detail);
    }

    return await response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Check your connection.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------
// Places
// ---------------------------------------------------------------

export async function searchPlaces(q, { limit = 20 } = {}) {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return request(`/api/places/search?${params.toString()}`);
}

export async function listPlaces({ q, category, lat, lon, radius_m, limit } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (lat != null) params.set('lat', String(lat));
  if (lon != null) params.set('lon', String(lon));
  if (radius_m != null) params.set('radius_m', String(radius_m));
  if (limit != null) params.set('limit', String(limit));
  const qs = params.toString();
  return request(`/api/places${qs ? '?' + qs : ''}`);
}

export async function getPlace(id) {
  return request(`/api/places/${id}`);
}

// ---------------------------------------------------------------
// Areas
// ---------------------------------------------------------------

export async function listAreas({ q, category, landmark_only, limit } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (landmark_only) params.set('landmark_only', 'true');
  if (limit != null) params.set('limit', String(limit));
  const qs = params.toString();
  return request(`/api/areas${qs ? '?' + qs : ''}`);
}

// ---------------------------------------------------------------
// Route
// ---------------------------------------------------------------

export async function computeRoute({ fromPlaceId, toPlaceId, fromLat, fromLon, toLat, toLon }) {
  const params = new URLSearchParams();
  if (fromPlaceId != null) params.set('from_place_id', String(fromPlaceId));
  if (fromLat != null) params.set('from_lat', String(fromLat));
  if (fromLon != null) params.set('from_lon', String(fromLon));
  if (toPlaceId != null) params.set('to_place_id', String(toPlaceId));
  if (toLat != null) params.set('to_lat', String(toLat));
  if (toLon != null) params.set('to_lon', String(toLon));
  return request(`/api/route?${params.toString()}`);
}

// ---------------------------------------------------------------
// Narration
// ---------------------------------------------------------------

export async function narrateRoute({ fromPlaceId, toPlaceId, lang = 'en', live = false }) {
  const params = new URLSearchParams({
    from_place_id: String(fromPlaceId),
    to_place_id: String(toPlaceId),
    lang,
    live: String(live),
  });
  return request(`/api/narrate?${params.toString()}`);
}

// ---------------------------------------------------------------
// Health
// ---------------------------------------------------------------

export async function getHealth() {
  return request('/api/health');
}