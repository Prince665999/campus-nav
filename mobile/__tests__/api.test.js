// Tests for services/api.js.
//
// These mock global.fetch so no real network calls happen. The
// assertions check that the client builds the right URLs and handles
// responses and errors correctly.

import {
  searchPlaces,
  listPlaces,
  getPlace,
  listAreas,
  computeRoute,
  narrateRoute,
  getHealth,
} from '@/services/api';

// Helper: mock fetch to return a JSON response.
function mockJsonResponse(body, { ok = true, status = 200 } = {}) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// URL building
// ---------------------------------------------------------------------------

describe('URL construction', () => {
  test('searchPlaces sends q and limit', async () => {
    global.fetch.mockReturnValueOnce(mockJsonResponse([]));
    await searchPlaces('library', { limit: 5 });

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('/api/places/search');
    expect(calledUrl).toContain('q=library');
    expect(calledUrl).toContain('limit=5');
  });

  test('listPlaces omits undefined params', async () => {
    global.fetch.mockReturnValueOnce(mockJsonResponse([]));
    await listPlaces({ q: 'library' });

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('q=library');
    expect(calledUrl).not.toContain('category');
    expect(calledUrl).not.toContain('lat');
  });

  test('listPlaces with no params sends no query string', async () => {
    global.fetch.mockReturnValueOnce(mockJsonResponse([]));
    await listPlaces();

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toMatch(/\/api\/places$/);
  });

  test('getPlace includes the id in the path', async () => {
    global.fetch.mockReturnValueOnce(mockJsonResponse({ id: 42 }));
    await getPlace(42);

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('/api/places/42');
  });

  test('computeRoute builds from/to params', async () => {
    global.fetch.mockReturnValueOnce(mockJsonResponse({ distance_m: 100 }));
    await computeRoute({ fromPlaceId: 1, toPlaceId: 5 });

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('from_place_id=1');
    expect(calledUrl).toContain('to_place_id=5');
  });

  test('computeRoute supports coordinates', async () => {
    global.fetch.mockReturnValueOnce(mockJsonResponse({ distance_m: 100 }));
    await computeRoute({ fromLat: -6.75, fromLon: 39.2, toPlaceId: 5 });

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('from_lat=-6.75');
    expect(calledUrl).toContain('from_lon=39.2');
    expect(calledUrl).toContain('to_place_id=5');
    expect(calledUrl).not.toContain('from_place_id');
  });

  test('narrateRoute sends lang and live', async () => {
    global.fetch.mockReturnValueOnce(mockJsonResponse({ text: 'walk north' }));
    await narrateRoute({ fromPlaceId: 1, toPlaceId: 5, lang: 'sw', live: true });

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('from_place_id=1');
    expect(calledUrl).toContain('to_place_id=5');
    expect(calledUrl).toContain('lang=sw');
    expect(calledUrl).toContain('live=true');
  });

  test('listAreas with landmark_only sends the flag', async () => {
    global.fetch.mockReturnValueOnce(mockJsonResponse([]));
    await listAreas({ landmark_only: true });

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('landmark_only=true');
  });

  test('getHealth hits the right path', async () => {
    global.fetch.mockReturnValueOnce(mockJsonResponse({ status: 'ok' }));
    await getHealth();

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('/api/health');
  });
});

// ---------------------------------------------------------------------------
// Response handling
// ---------------------------------------------------------------------------

describe('response handling', () => {
  test('successful response returns parsed JSON', async () => {
    global.fetch.mockReturnValueOnce(
      mockJsonResponse([{ id: 1, name: 'Library' }])
    );
    const result = await searchPlaces('lib');
    expect(result).toEqual([{ id: 1, name: 'Library' }]);
  });

  test('HTTP error with JSON body surfaces the detail message', async () => {
    global.fetch.mockReturnValueOnce(
      mockJsonResponse(
        { detail: 'Place 999 not found', code: 'NotFoundError' },
        { ok: false, status: 404 }
      )
    );
    await expect(getPlace(999)).rejects.toThrow('Place 999 not found');
  });

  test('HTTP error with non-JSON body uses a generic message', async () => {
    global.fetch.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('not json')),
      })
    );
    await expect(getHealth()).rejects.toThrow(/500/);
  });

  test('network error propagates', async () => {
    global.fetch.mockReturnValueOnce(
      Promise.reject(new Error('Network request failed'))
    );
    await expect(getHealth()).rejects.toThrow('Network request failed');
  });
});