// A tiny module-level store for the "from" coordinates between
// screens.
//
// Why not URL params: Expo Router's param serialization can lose or
// mangle negative decimals like "-8.9403215" (a latitude). Passing
// them through a module variable is deterministic and doesn't depend
// on how the router encodes strings.
//
// A request older than 30 seconds is treated as stale — that covers
// the case where the user navigates away and back before the route
// preview mounts.

let _pending = null;

const STALE_MS = 30000;

export function setRouteRequest({ fromLat, fromLon, fromId, toId }) {
  _pending = {
    fromLat: fromLat != null ? Number(fromLat) : null,
    fromLon: fromLon != null ? Number(fromLon) : null,
    fromId: fromId != null ? Number(fromId) : null,
    toId: toId != null ? Number(toId) : null,
    timestamp: Date.now(),
  };
}

export function takeRouteRequest() {
  if (!_pending) return null;
  if (Date.now() - _pending.timestamp > STALE_MS) {
    _pending = null;
    return null;
  }
  const req = _pending;
  _pending = null;
  return req;
}

export function clearRouteRequest() {
  _pending = null;
}