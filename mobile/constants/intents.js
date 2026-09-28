// Intent definitions for the Explore screen.
//
// "Intents" describe what a student wants to *do*, as opposed to
// what a place *is* (that's category). A place can serve multiple
// intents; an intent can span multiple categories.
//
// These are display-only. The DB stores whatever an admin types
// into a place's `intents` field, as a semicolon-separated string.
// When a chip is tapped, we send its `key` to the backend, which
// does a substring match against the intents field.
//
// So the actual matching is: does the place's intents string
// contain this key? "eat" matches "eat; study; wifi" — because
// "eat" is a substring of that string. Keep intents short and
// distinct so this stays reliable.
//
// If you later want a structured, enforced vocabulary, this is the
// file to change. For now it's advisory.

export const INTENTS = [
  { key: 'eat',     labelKey: 'intents.eat'     },
  { key: 'study',   labelKey: 'intents.study'   },
  { key: 'print',   labelKey: 'intents.print'   },
  { key: 'wifi',    labelKey: 'intents.wifi'    },
  { key: 'sports',  labelKey: 'intents.sports'  },
  { key: 'meet',    labelKey: 'intents.meet'    },
  { key: 'toilet',  labelKey: 'intents.toilet'  },
  { key: 'prayer',  labelKey: 'intents.prayer'  },
];