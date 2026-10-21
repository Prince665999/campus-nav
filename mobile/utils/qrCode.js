// Reads the text from a scanned QR code and returns the code inside it.
//
// Accepts:
//   campusnav://qr/LIB-G-02          (what the printed codes contain)
//   https://any-domain/q/LIB-G-02    (if the app goes on the web later)
//   LIB-G-02                         (typed by hand)
// Returns the code, or null if the text is not a valid code.
//
// Codes are letters, digits, "-" and "_", at most 32 characters. The same
// rule is used by the backend ingest and the print script.

const CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;

export function parseQrCode(raw) {
  if (raw === null || raw === undefined) return null;

  const text = String(raw)
    .trim()
    .split(/[?#]/)[0] // drop any ?query or #fragment
    .replace(/\/+$/, ''); // drop trailing slashes
  if (!text) return null;

  const last = text.split('/').pop();
  return CODE_RE.test(last) ? last : null;
}
