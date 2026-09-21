// Media selection helpers.

// Given a list of photos and the compass direction the student is
// approaching from, pick the photo whose bearing_deg is closest.
//
// Bearing wraps at 0/360, so 350 and 10 are 20 degrees apart, not
// 340. The angular distance function below handles that.
export function closestApproachPhoto(photos, approachBearing) {
  if (!photos || photos.length === 0) return null;

  const withBearing = photos.filter((p) => p.bearing_deg != null);
  if (withBearing.length === 0) {
    // Nothing has a bearing. Prefer the primary, else the first.
    return photos.find((p) => p.is_primary) || photos[0];
  }

  const angularDistance = (a, b) => {
    const d = Math.abs(a - b) % 360;
    return Math.min(d, 360 - d);
  };

  return withBearing.reduce((best, current) => {
    const bestDist = angularDistance(best.bearing_deg, approachBearing);
    const currentDist = angularDistance(current.bearing_deg, approachBearing);
    return currentDist < bestDist ? current : best;
  });
}