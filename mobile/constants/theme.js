// Shared colours, spacing, and typography.
//
// Every colour in the app pulls from here. The contrast ratio between
// each text colour and its background meets WCAG AA (4.5:1 for body
// text, 3:1 for large text) on both the white cards and the light grey
// screen background. If you change a colour, keep that in mind: very
// light text colours on the grey background are the first thing to fail.

// ---------------------------------------------------------------------------
// THE PALETTE — change the look of the whole app from these few lines.
// Deep green + light grey-blue screen background.
// ---------------------------------------------------------------------------
const BRAND = {
  // Buttons, links, selected chips, the route line, the header title.
  primary: '#046c2f',
  primaryDark: '#03501f',

  // The screen background behind the cards (home, Explore, Settings...).
  // This is the same colour the indoor map uses.
  canvas: '#f1f5f9',

  // Cards, sheets, the search bar, input fields. A very slightly warm white.
  card: '#fffefb',

  // Thin beige lines around cards and between rows.
  border: '#e6e0cc',
  borderSubtle: '#efead9',

  // Text: dark green-black, then two softer greys with a green undertone.
  text: '#12201a',
  textMuted: '#4a574f',
  textFaint: '#66705f',
};

export const COLORS = {
  // Cards, sheets, the search bar, input fields.
  background: BRAND.card,
  // The screen background (home, Explore, Settings, and anything that
  // doesn't set its own).
  backgroundSubtle: BRAND.canvas,
  border: BRAND.border,
  borderSubtle: BRAND.borderSubtle,

  // The top bar: solid green, with light text and icons on it.
  headerBackground: BRAND.primary,
  headerText: '#ffffff', // 6.6:1 on the green
  headerTextFaint: '#a9d3b6', // disabled header icons (4.0:1 on the green)
  headerAccent: '#fcd34d', // the filled favourite heart on the green (4.6:1)

  // Body text. 16.8:1 on white — well above AA.
  text: BRAND.text,

  // Secondary text. 7.6:1 on white, 6.9:1 on the grey.
  textMuted: BRAND.textMuted,

  // Tertiary text. 5.2:1 on white, 4.7:1 on the grey. Don't go lighter:
  // earlier versions used #9ca3af (2.8:1), which fails AA for body text.
  textFaint: BRAND.textFaint,

  primary: BRAND.primary,
  primaryDark: BRAND.primaryDark, // darkened for better contrast against white
  // A pale green tint of the primary colour, for selected rows, icon
  // circles and highlights. Not used everywhere yet.
  primaryTint: '#dcefe2',

  success: '#046c2f',
  danger: '#b91c1c', // darkened for contrast
  warning: '#b45309', // darkened for contrast
  warningBg: '#fef3c7',
  warningBorder: '#f59e0b',
  warningText: '#78350f',
  warningTextSubtle: '#92400e',
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