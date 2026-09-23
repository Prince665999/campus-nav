// Shared colours, spacing, and typography.
//
// Every colour in the app pulls from here. The contrast ratio between
// each text colour and its background meets WCAG AA (4.5:1 for body
// text, 3:1 for large text).

export const COLORS = {
  background: '#ffffff',
  backgroundSubtle: '#f9fafb',
  border: '#e5e7eb',
  borderSubtle: '#f3f4f6',

  // Body text. 4.5:1 contrast against background.
  // #111827 on #ffffff = 16.75:1 — well above AA.
  text: '#111827',

  // Secondary text. 4.5:1 against background.
  // #4b5563 on #ffffff = 8.6:1 — above AA.
  textMuted: '#4b5563',

  // Tertiary text. Kept above 4.5:1 for AA compliance.
  // Earlier versions used #9ca3af (2.8:1) which fails AA for body.
  textFaint: '#6b7280',

  primary: '#2563eb',
  primaryDark: '#1e3a8a', // darkened for better contrast against white

  success: '#15803d',
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