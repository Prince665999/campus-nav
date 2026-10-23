// The text on the map's turn-around button: which way is up the screen.
//
// It matches the snapping step, so the label is always true:
//   snap 90 or 45  -> N, NE, E, SE, S, SW, W, NW
//   snap 22.5      -> 16 directions (NNE, ENE, ...)
//   anything finer -> the angle itself, e.g. "137°"

const WIND_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const WIND_16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

export function headingLabel(heading, snapDeg) {
  const h = ((heading % 360) + 360) % 360;
  if (snapDeg >= 45) return WIND_8[Math.round(h / 45) % 8];
  if (snapDeg === 22.5) return WIND_16[Math.round(h / 22.5) % 16];
  return `${Math.round(h) % 360}°`;
}