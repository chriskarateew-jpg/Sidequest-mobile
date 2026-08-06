// Gumpa — shared prop contract (and shared formatting/quantization logic)
// for the two location-picker-map implementations (native.tsx: real
// interactive react-native-maps picker; web.tsx: plain numeric fallback,
// since react-native-maps has no web renderer at all). Kept in its own file
// since it's pure types/functions with no platform-specific runtime code,
// so it resolves normally without needing tsconfig's moduleSuffixes trick
// the two implementation files rely on.

export interface LocationPickerValue {
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface LocationPickerMapProps {
  value: LocationPickerValue | null;
  onChange: (value: LocationPickerValue | null) => void;
}

export const DEFAULT_RADIUS_METERS = 100;
export const MIN_RADIUS_METERS = 20;
export const MAX_RADIUS_METERS = 5000;

const METERS_PER_MILE = 1609.34;
export const HALF_MILE_METERS = METERS_PER_MILE / 2; // ~805m

// Fine (whole-meter) control up close, where an exact spot matters most;
// coarser tenth-of-a-mile steps once the radius is already
// neighborhood-sized, where extra meter-level precision stops being
// meaningful (and, on the map picker, just makes the handle fiddlier to
// land on a specific value).
export function quantizeRadius(meters: number): number {
  const clamped = Math.min(MAX_RADIUS_METERS, Math.max(MIN_RADIUS_METERS, meters));
  if (clamped <= HALF_MILE_METERS) return Math.round(clamped);
  const miles = clamped / METERS_PER_MILE;
  const snappedMiles = Math.round(miles * 10) / 10;
  return Math.round(snappedMiles * METERS_PER_MILE);
}

export function formatRadius(meters: number): string {
  if (meters <= HALF_MILE_METERS) return `${Math.round(meters)}m`;
  return `${(meters / METERS_PER_MILE).toFixed(1)}mi`;
}
