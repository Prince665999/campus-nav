// The admin site's API client.

async function request(path, options = {}) {
  const url = '/api/proxy' + path;

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) return null;

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
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
    } catch {
      // Not JSON.
    }
    throw new Error(detail);
  }

  return response.json();
}

export const api = {
  // ---------- Stats ----------
  getStats: () => request('/api/admin/stats'),

  // ---------- Places ----------
  listPlaces: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/places${qs ? '?' + qs : ''}`);
  },
  getPlace: (id) => request(`/api/places/${id}`),
  updatePlace: (id, data) =>
    request(`/api/admin/places/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deletePlace: (id) =>
    request(`/api/admin/places/${id}`, { method: 'DELETE' }),

  // ---------- Media ----------
  listMediaForPlace: (placeId) => request(`/api/media/place/${placeId}`),
  uploadMedia: (formData) =>
    request('/api/admin/media', {
      method: 'POST',
      body: formData,
    }),
  deleteMedia: (id) =>
    request(`/api/admin/media/${id}`, { method: 'DELETE' }),

  // ---------- Reports ----------
  listReports: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/admin/reports${qs ? '?' + qs : ''}`);
  },
  updateReportStatus: (id, status) =>
    request(`/api/admin/reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),

  // ---------- Map health ----------
  getMapHealth: () => request('/api/admin/map-health'),

  // ---------- Re-import ----------
  getReimportDiff: () => request('/api/admin/reimport/diff'),
  runReimport: () =>
    request('/api/admin/reimport', { method: 'POST' }),

  // ---------- Route tester ----------
  computeRoute: (fromPlaceId, toPlaceId) =>
    request(`/api/route?from_place_id=${fromPlaceId}&to_place_id=${toPlaceId}`),
  narrateRoute: (fromPlaceId, toPlaceId, lang = 'en') =>
    request(
      `/api/narrate?from_place_id=${fromPlaceId}&to_place_id=${toPlaceId}&lang=${lang}`
    ),

  // ---------- Roles ----------
  listUsers: () => request('/api/admin/users'),
  createUser: (data) =>
    request('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteUser: (id) =>
    request(`/api/admin/users/${id}`, { method: 'DELETE' }),

  // ---------- Knowledge base ----------
  listKnowledgeDocuments: () => request('/api/admin/knowledge'),
  deleteKnowledgeDocument: (id) =>
    request(`/api/admin/knowledge/${id}`, { method: 'DELETE' }),
};