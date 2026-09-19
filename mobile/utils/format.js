// Formatting helpers for distances and durations.
//
// Mirrors the round-then-speak style used in the backend's
// campus_graph.py `round_distance` and `describe_distance`, so what
// the student sees on screen matches what the narration says.

export function roundDistance(meters) {
  if (meters < 10) return Math.round(meters);
  if (meters < 100) return Math.round(meters / 5) * 5;
  return Math.round(meters / 10) * 10;
}

export function formatDistance(meters) {
  if (meters < 1000) {
    return `${roundDistance(meters)} m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

export function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

// Walking speed assumption for estimating durations. A slow
// campus walk — students stop, turn, look around.
export const WALKING_SPEED_M_PER_S = 1.1;

export function estimateWalkingSeconds(distanceMeters) {
  return distanceMeters / WALKING_SPEED_M_PER_S;
}