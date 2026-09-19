// Category chips shown on the Home screen.
//
// Each entry has a `key` that matches what the API stores in the
// `category` column, and a `label` shown to the user. The `icon` is
// an emoji for now; Phase 7 can swap them for proper icons.

export const CATEGORIES = [
  { key: null, label: 'All', icon: '📍' },
  { key: 'building=university', label: 'Lecture halls', icon: '🏛️' },
  { key: 'amenity=cafe', label: 'Food', icon: '🍽️' },
  { key: 'amenity=restaurant', label: 'Restaurant', icon: '🍴' },
  { key: 'amenity=fast_food', label: 'Fast food', icon: '🍔' },
  { key: 'amenity=bank', label: 'Banks & ATMs', icon: '🏧' },
  { key: 'amenity=toilets', label: 'Toilets', icon: '🚻' },
  { key: 'amenity=drinking_water', label: 'Water', icon: '💧' },
  { key: 'office=yes', label: 'Offices', icon: '🏢' },
  { key: 'tourism=hostel', label: 'Hostels', icon: '🛏️' },
  { key: 'amenity=library', label: 'Library', icon: '📚' },
];

// The value sent to /api/places?category=... for "all categories".
// We use `undefined` rather than a special string so the API client
// can just omit the parameter.
export const ALL_CATEGORIES = null;