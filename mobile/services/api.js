// The API client. Every network call goes through here.

import { API_BASE_URL, API_TIMEOUT_MS } from '@/constants/config';
import { getDeviceId } from '@/services/session';

async function request(path, options = {}) {
  const url = API_BASE_URL + path;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const deviceId = await getDeviceId();

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'X-Device-Id': deviceId,
        ...(options.headers || {}),
      },
    });

    if (response.status === 204) return null;

    if (!response.ok) {
      let detail = `Request failed (${response.status})`;
      try {
        const body = await response.json();
        if (body && body.detail) detail = body.detail;
      } catch {
        // Not JSON. Keep the generic message.
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
// Media
// ---------------------------------------------------------------

export async function listMediaForPlace(placeId) {
  return request(`/api/media/place/${placeId}`);
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
// Destinations
// ---------------------------------------------------------------

export async function listRecents({ limit = 5 } = {}) {
  return request(`/api/destinations/recent?limit=${limit}`);
}

export async function recordRecent(placeId) {
  return request('/api/destinations/recent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ place_id: placeId }),
  });
}

export async function listFavorites() {
  return request('/api/destinations/favorites');
}

export async function addFavorite(placeId) {
  return request('/api/destinations/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ place_id: placeId }),
  });
}

export async function removeFavorite(placeId) {
  return request(`/api/destinations/favorites/${placeId}`, {
    method: 'DELETE',
  });
}

export async function isFavorite(placeId) {
  const result = await request(`/api/destinations/favorites/${placeId}/exists`);
  return result.is_favorite;
}

// ---------------------------------------------------------------
// Reports
// ---------------------------------------------------------------

export async function createReport({ kind, body, placeId, edgeId, photoUrl }) {
  return request('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind,
      body: body || null,
      place_id: placeId || null,
      edge_id: edgeId || null,
      photo_url: photoUrl || null,
    }),
  });
}

// ---------------------------------------------------------------
// Chat
// ---------------------------------------------------------------

export async function extractDestination(message) {
  return request('/api/chat/extract-destination', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

export async function startChatSession() {
  return request('/api/chat/session', { method: 'POST' });
}

export async function endChatSession(sessionId) {
  return request(`/api/chat/session/${sessionId}`, { method: 'DELETE' });
}

export async function sendChatMessage({
  message,
  sessionId,
  fromPlaceId,
  toPlaceId,
  currentStepIndex,
  distanceFromStartM,
  currentLat,
  currentLon,
}) {
  const body = {
    message,
    session_id: sessionId || null,
    from_place_id: fromPlaceId ?? null,
    to_place_id: toPlaceId ?? null,
    current_step_index: currentStepIndex ?? null,
    distance_from_start_m: distanceFromStartM ?? null,
    current_lat: currentLat ?? null,
    current_lon: currentLon ?? null,
  };
  return request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------
// Health
// ---------------------------------------------------------------

export async function getHealth() {
  return request('/api/health');
}