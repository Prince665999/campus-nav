// Decides from which zoom a room's name should be shown, so that a name never
// spills outside its room.
//
// The text is drawn at a size that grows a little as you zoom in (smaller
// when zoomed out). A room grows on screen much faster than that, so a name
// that fits at one zoom keeps fitting at every higher zoom. This finds the
// first zoom where it fits, for each room, once.

const AVG_CHAR_EM = 0.6; // average width of one character, in text-size units
const SPACE_EM = 0.3;
const LINE_HEIGHT_EM = 1.2;

/** The text size used at a zoom level (also used by the map layer). */
export function sizeAtZoom(zoom, { minSize, maxSize, fullSizeZoom, startZoom }) {
  if (zoom <= startZoom) return minSize;
  if (zoom >= fullSizeZoom) return maxSize;
  return minSize + ((zoom - startZoom) / (fullSizeZoom - startZoom)) * (maxSize - minSize);
}

/** Width and height of a name, in text-size units, once wrapped at wrapEm. */
export function textBlockEm(text, wrapEm) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { width: 0, height: 0 };

  let widest = 0;
  let line = 0;
  let lines = 1;
  for (const word of words) {
    const w = word.length * AVG_CHAR_EM;
    if (line === 0) {
      line = w;
    } else if (line + SPACE_EM + w <= wrapEm) {
      line += SPACE_EM + w;
    } else {
      widest = Math.max(widest, line);
      line = w;
      lines += 1;
    }
  }
  widest = Math.max(widest, line);
  return { width: widest, height: lines * LINE_HEIGHT_EM };
}

/**
 * The zoom from which `text` fits inside a room whose biggest inside circle
 * has radius `radiusM`, rounded UP to a multiple of `bandStep`.
 * Returns null when it never fits, or there is no name.
 *
 * options: { latDeg, minSize, maxSize, fullSizeZoom, startZoom, wrapEm,
 *            fit, bandStep, fromZoom, toZoom }
 *   fit > 1 lets names overflow a little (more names shown); < 1 hides more.
 */
export function labelMinZoom(text, radiusM, options) {
  const {
    latDeg,
    wrapEm,
    fit = 1,
    bandStep = 0.5,
    fromZoom = 15,
    toZoom = 22,
  } = options;

  const block = textBlockEm(text, wrapEm);
  if (block.width === 0 || !(radiusM > 0)) return null;

  // Half the diagonal of the text block, per unit of text size.
  const halfDiagonalEm = Math.hypot(block.width, block.height) / 2;
  const cosLat = Math.cos((latDeg * Math.PI) / 180);

  for (let z = fromZoom; z <= toZoom + 1e-9; z += 0.25) {
    const metresPerPixel = (40075016.686 * cosLat) / (512 * Math.pow(2, z));
    const radiusPx = (radiusM * fit) / metresPerPixel;
    const size = sizeAtZoom(z, options);
    if (halfDiagonalEm * size <= radiusPx) {
      return Math.ceil(z / bandStep - 1e-9) * bandStep;
    }
  }
  return null;
}
