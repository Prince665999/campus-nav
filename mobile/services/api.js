// The API client. Every network call goes through here.

import { API_BASE_URL, API_TIMEOUT_MS } from '@/constants/config';
import { getDeviceId } from '@/services/session';
import {
  getCachedFloor,
  setCachedFloor,
} from '@/services/indoorCache';

export async function request(path, options = {}) {
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
      let code = null;
      try {
        const body = await response.json();
        if (body && body.detail) {
          if (Array.isArray(body.detail)) {
            detail = body.detail
              .map((e) => `${e.loc?.join('.') || 'field'}: ${e.msg}`)
              .join('; ');
          } else {
            detail = body.detail;
          }
        }
        if (body && body.code) code = body.code;
      } catch {
        // Not JSON.
      }
      const err = new Error(detail);
      err.code = code;
      throw err;
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

export async function listPlaces({
  q,
  category,
  intent,
  kind,
  building_name,
  level,
  lat,
  lon,
  radius_m,
  limit,
} = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (intent) params.set('intent', intent);
  if (kind) params.set('kind', kind);
  if (building_name) params.set('building_name', building_name);
  if (level != null) params.set('level', String(level));
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
// Media
// ---------------------------------------------------------------

export async function listMediaForPlace(placeId) {
  return request(`/api/media/place/${placeId}`);
}

// ---------------------------------------------------------------
// Route
// ---------------------------------------------------------------

export async function computeRoute({
  fromPlaceId,
  toPlaceId,
  fromLat,
  fromLon,
  fromAccuracyM,
  toLat,
  toLon,
}) {
  const params = new URLSearchParams();
  if (fromPlaceId != null) params.set('from_place_id', String(fromPlaceId));
  if (fromLat != null) params.set('from_lat', String(fromLat));
  if (fromLon != null) params.set('from_lon', String(fromLon));
  if (fromAccuracyM != null) {
    params.set('from_accuracy_m', String(fromAccuracyM));
  }
  if (toPlaceId != null) params.set('to_place_id', String(toPlaceId));
  if (toLat != null) params.set('to_lat', String(toLat));
  if (toLon != null) params.set('to_lon', String(toLon));
  return request(`/api/route?${params.toString()}`);
}

// ---------------------------------------------------------------
// Narration
// ---------------------------------------------------------------

export async function narrateRoute({
  fromPlaceId,
  toPlaceId,
  fromLat,
  fromLon,
  lang = 'en',
  live = false,
}) {
  const params = new URLSearchParams();
  if (fromPlaceId != null) params.set('from_place_id', String(fromPlaceId));
  if (fromLat != null) params.set('from_lat', String(fromLat));
  if (fromLon != null) params.set('from_lon', String(fromLon));
  params.set('to_place_id', String(toPlaceId));
  params.set('lang', lang);
  params.set('live', String(live));
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
  const result = await request(
    `/api/destinations/favorites/${placeId}/exists`
  );
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
// Route chat (in-walk questions)
// ---------------------------------------------------------------

export async function extractDestination(message) {
  return request('/api/chat/extract-destination', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

export async function startRouteChatSession() {
  return request('/api/chat/session', { method: 'POST' });
}

export async function endRouteChatSession(sessionId) {
  return request(`/api/chat/session/${sessionId}`, { method: 'DELETE' });
}

export async function sendRouteChatMessage({
  message,
  sessionId,
  fromPlaceId,
  fromLat,
  fromLon,
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
    from_lat: fromLat ?? null,
    from_lon: fromLon ?? null,
    to_place_id: toPlaceId ?? null,
    current_step_index: currentStepIndex ?? 0,
    distance_from_start_m: distanceFromStartM ?? 0,
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
// Doc chat (university questions)
// ---------------------------------------------------------------

export async function startDocChatSession() {
  return request('/api/chat/doc/session', { method: 'POST' });
}

export async function endDocChatSession(sessionId) {
  return request(`/api/chat/doc/session/${sessionId}`, { method: 'DELETE' });
}

export async function sendDocChatMessage({ message, sessionId }) {
  const body = {
    message,
    session_id: sessionId || null,
  };
  return request('/api/chat/doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function searchKnowledge(q, { topK = 5 } = {}) {
  const params = new URLSearchParams({ q, top_k: String(topK) });
  return request(`/api/chat/doc/search?${params.toString()}`);
}

// ---------------------------------------------------------------
// Wi-Fi
// ---------------------------------------------------------------

export async function getNearbyWifi({ lat, lon, r = 25 } = {}) {
  const params = new URLSearchParams();
  if (lat != null) params.set('lat', String(lat));
  if (lon != null) params.set('lon', String(lon));
  params.set('r', String(r));
  return request(`/api/wifi/nearby?${params.toString()}`);
}

// ---------------------------------------------------------------
// Indoor floor plans
// ---------------------------------------------------------------

export async function getIndoorAreas({ buildingName, level }) {
  const cached = await getCachedFloor(buildingName, level);
  if (cached) return cached;

  const params = new URLSearchParams({
    building_name: buildingName,
    level: String(level),
  });
  const data = await request(`/api/indoor/areas?${params.toString()}`);

  setCachedFloor(buildingName, level, data).catch(() => {});

  return data;
}

// ---------------------------------------------------------------
// Entrances (for the "are you inside?" trigger)
// ---------------------------------------------------------------

/**
 * All building entrances. Used by the starting-point logic to work
 * out whether a GPS fix is close enough to an entrance that the
 * student might actually be inside.
 */
export async function listEntrances() {
  return listPlaces({ kind: 'entrance', limit: 200 });
}

// ---------------------------------------------------------------
// Indoor doors (for the door picker)
// ---------------------------------------------------------------

/**
 * Indoor door nodes. Used by the door picker to let the student
 * declare which door they're starting from.
 *
 * Pass `buildingName` to narrow to one building.
 *
 * The backend caps /api/places at limit=200, so we stay under that.
 * A single building has far fewer than 200 doors; if a caller ever
 * needs more, they'd need a dedicated endpoint.
 */
export async function listIndoorDoors({ buildingName } = {}) {
  return listPlaces({
    kind: 'indoor',
    building_name: buildingName || undefined,
    limit: 200,
  });
}

// ---------------------------------------------------------------
// Health
// ---------------------------------------------------------------

export async function getHealth() {
  return request('/api/health');
}