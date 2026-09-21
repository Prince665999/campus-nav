// Category chips shown on the Home screen.
//
// Each entry has a `key` (what the API stores in the `category`
// column) and a `labelKey` (a lookup into the i18n files). The icon
// is an emoji for now; Phase 18 can swap them for proper icons.

export const CATEGORIES = [
  { key: null, labelKey: 'categories.all', icon: '📍' },
  { key: 'building=university', labelKey: 'categories.lectureHalls', icon: '🏛️' },
  { key: 'amenity=cafe', labelKey: 'categories.food', icon: '🍽️' },
  { key: 'amenity=restaurant', labelKey: 'categories.restaurant', icon: '🍴' },
  { key: 'amenity=fast_food', labelKey: 'categories.fastFood', icon: '🍔' },
  { key: 'amenity=bank', labelKey: 'categories.banks', icon: '🏧' },
  { key: 'amenity=toilets', labelKey: 'categories.toilets', icon: '🚻' },
  { key: 'amenity=drinking_water', labelKey: 'categories.water', icon: '💧' },
  { key: 'office=yes', labelKey: 'categories.offices', icon: '🏢' },
  { key: 'tourism=hostel', labelKey: 'categories.hostels', icon: '🛏️' },
  { key: 'amenity=library', labelKey: 'categories.library', icon: '📚' },
];

export const ALL_CATEGORIES = null;