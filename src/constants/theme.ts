// Gumpa palette — a single blue brand tone on a light, editorial
// backdrop. accent is the given brand blue; accent2 (gradient partner) and
// accentSoft (tint background) are lighter shades of that same hue, not
// separately-chosen colors. gold still marks the reward, not the brand.
// Location-tied task cards reuse accent/accent2 for their animated barrier
// (see LocalBarrierBorder) rather than a separate color.
export const Colors = {
  bg: '#F5F4F0',
  card: '#FFFFFF',
  ink: '#111214',
  muted: '#6E7178',
  line: '#E5E3DD',
  accent: '#1A2FE5',
  accent2: '#5F6DED',
  accentSoft: '#DDE0FB',
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
