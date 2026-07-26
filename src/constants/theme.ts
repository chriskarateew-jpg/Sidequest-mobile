// Sidequest palette — an analogous yellow-green/orange/green brand trio on a
// light, editorial backdrop. accent/accent2 are the two brand tones; gold
// still marks the reward, not the brand. localAccent is reserved for
// location-tied task cards only, so that highlight reads as a distinct
// signal rather than just "more brand color."
export const Colors = {
  bg: '#F5F4F0',
  card: '#FFFFFF',
  ink: '#111214',
  muted: '#6E7178',
  line: '#E5E3DD',
  accent: '#EF8F10',
  accent2: '#D7EE11',
  accentSoft: '#FCE9CC',
  localAccent: '#68EB14',
  gold: '#FFB800',
  goldSoft: '#FFF1CC',
  goldText: '#7A4E00',
  green: '#12B76A',
  red: '#FF3B30',
} as const;

export const Categories = {
  fitness: { label: 'Fitness', emoji: '💪', color: '#12B76A' },
  finance: { label: 'Finance', emoji: '💰', color: '#FF8A00' },
  social: { label: 'Social', emoji: '🗣️', color: '#2E6BFF' },
  courage: { label: 'Courage', emoji: '🦁', color: '#FF3B30' },
  explore: { label: 'Explore', emoji: '🧭', color: '#7C3AED' },
  mind: { label: 'Mind', emoji: '🧠', color: '#00A9B5' },
} as const;

export type CategoryId = keyof typeof Categories;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  card: 18,
  pill: 999,
  sm: 12,
} as const;

export const Shadow = {
  shadowColor: '#111214',
  shadowOpacity: 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
