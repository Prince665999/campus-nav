// Category chips shown on the Home screen.
//
// Each entry has:
//   key       — what the API stores in `category` (used as the filter)
//   labelKey  — the i18n lookup for the visible label
//   iconKey   — the ICONS key from constants/icons.js
//
// The icon names map to MaterialIcons. Changing an icon is one edit
// in constants/icons.js; every chip that uses that key updates.

export const CATEGORIES = [
  { key: null, labelKey: 'categories.all', iconKey: 'place' },
  { key: 'building=university', labelKey: 'categories.lectureHalls', iconKey: 'lecture' },
  { key: 'amenity=cafe', labelKey: 'categories.food', iconKey: 'food' },
  { key: 'amenity=restaurant', labelKey: 'categories.restaurant', iconKey: 'food' },
  { key: 'amenity=fast_food', labelKey: 'categories.fastFood', iconKey: 'food' },
  { key: 'amenity=bank', labelKey: 'categories.banks', iconKey: 'bank' },
  { key: 'amenity=toilets', labelKey: 'categories.toilets', iconKey: 'toilet' },
  { key: 'amenity=drinking_water', labelKey: 'categories.water', iconKey: 'water' },
  { key: 'office=yes', labelKey: 'categories.offices', iconKey: 'office' },
  { key: 'tourism=hostel', labelKey: 'categories.hostels', iconKey: 'hostel' },
  { key: 'amenity=library', labelKey: 'categories.library', iconKey: 'library' },
];

export const ALL_CATEGORIES = null;