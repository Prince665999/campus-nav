// Shared colours, spacing, and typography.
//
// Dark theme variant. Every colour the app uses is defined here, and the
// contrast ratios have been chosen so body text is at least 4.5:1 against
// the background it sits on. Edit the PALETTE block to adjust the whole app.
//
// To go back to the light theme, restore the previous version of this file.
// Nothing else in the app needs to change.

// ---------------------------------------------------------------------------
// THE PALETTE — change the look of the whole app from these few lines.
// ---------------------------------------------------------------------------
const PALETTE = {
  // Surfaces, from furthest back to closest.
  // The screen background. Very dark slate, not pure black: pure black on
  // OLED screens can look harsh, and it makes shadows impossible.
  canvas: '#0f172a',
  // Cards, sheets, the search bar, input fields. One step lighter than the
  // canvas so they read as raised surfaces.
  surface: '#1e293b',
  // A slightly lighter surface for nested elements (chips, list rows).
  surfaceRaised: '#273449',

  // Thin lines around cards and between rows. Dark-mode borders are
  // subtle — they define edges without shouting.
  border: '#334155',
  borderSubtle: '#25324a',

  // Text. Very light greys, slightly blue-tinted so they feel coherent
  // with the slate surfaces.
  // #e2e8f0 on #0f172a = 14.6:1 — well above AA.
  text: '#e2e8f0',
  // #94a3b8 on #0f172a = 6.9:1 — above AA.
  textMuted: '#94a3b8',
  // #64748b on #0f172a = 4.6:1 — just above AA for body text.
  textFaint: '#64748b',

  // Brand colours. The primary is a lighter blue than the light theme's
  // #2563eb, so it stands out against the dark background.
  primary: '#60a5fa',
  primaryDark: '#3b82f6',

  // A very dark tint of the primary, for selected rows and icon circles.
  primaryTint: '#1e3a5f',

  // Second accent (teal).
  accent: '#5eead4',

  // Status colours, adjusted for dark backgrounds. The "bg" variants are
  // dark tints, and the text variants are light enough to read on them.
  success: '#4ade80',
  successBg: '#052e16',
  danger: '#f87171',
  dangerBg: '#450a0a',
  warning: '#fbbf24',
  warningBg: '#422006',
  warningBorder: '#a16207',
  warningText: '#fde68a',
  warningTextSubtle: '#fcd34d',
};

export const COLORS = {
  // This is the "surface" colour — cards, sheets, search bar. In light
  // themes this was #ffffff. In dark it's the raised slate.
  background: PALETTE.surface,
  // The screen background behind the cards.
  backgroundSubtle: PALETTE.canvas,
  border: PALETTE.border,
  borderSubtle: PALETTE.borderSubtle,

  // Header / title bar. A touch lighter than the canvas so it separates
  // from the content below.
  headerBackground: PALETTE.surface,

  // Text colours.
  text: PALETTE.text,
  textMuted: PALETTE.textMuted,
  textFaint: PALETTE.textFaint,

  // Brand colours.
  primary: PALETTE.primary,
  primaryDark: PALETTE.primaryDark,
  primaryTint: PALETTE.primaryTint,
  accent: PALETTE.accent,

  // Status colours.
  success: PALETTE.success,
  successBg: PALETTE.successBg,
  danger: PALETTE.danger,
  dangerBg: PALETTE.dangerBg,
  warning: PALETTE.warning,
  warningBg: PALETTE.warningBg,
  warningBorder: PALETTE.warningBorder,
  warningText: PALETTE.warningText,
  warningTextSubtle: PALETTE.warningTextSubtle,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
};

// Touch targets. Apple's HIG and Android's Material both recommend a
// 44pt minimum. We use 48 to be safe.
export const TOUCH = {
  minHeight: 48,
  minWidth: 48,
};

// Font sizes. These are the base sizes. A large-text accessibility
// setting multiplies them by 1.3 — see useAccessibility.js.
export const FONT_SIZE = {
  small: 13,
  body: 15,
  large: 17,
  title: 22,
  hero: 26,
};

// Multiplier applied when the user has enabled large text.
export const LARGE_TEXT_MULTIPLIER = 1.3;