// Gumpa — device location, one-shot fetch, no background watch. Two modes:
//  - getCurrentRoundedLocation(): coarse (~1km grid), used only to suggest
//    tasks tied to real places nearby. Rounded here before it ever leaves
//    the device — this query can happen repeatedly from the same spot
//    (often home), so coarsening at the source stops that pattern from
//    ever building a precise location history server-side.
//  - getCurrentPreciseLocation(): a real GPS fix, used only for the
//    one-shot proof-submission GPS check (server/src/complete.ts binds a
//    submitted photo to a challenge's real-world location). That check
//    doesn't inherit the coarse-rounding constraint above — it's a single
//    server-side distance comparison, never displayed, never repeated in a
//    pattern that builds a location history — but what actually reaches
//    storage still gets rounded, just server-side at the point of persisting
//    (see recordPhotoHash in server/src/photo-hash.ts), not client-side here.

import * as Location from 'expo-location';

export type LocationResult = { status: 'ok'; lat: number; lng: number } | { status: 'denied' } | { status: 'error' };

// getCurrentPreciseLocation-only: the OS reported a fix, but its own
// confidence radius (coords.accuracy) is too wide to trust for a half-mile
// venue check — treated the same as no fix at all (see attachedLocation in
// src/lib/photo.ts), not as a hard failure. A momentary bad GPS read
// shouldn't block a submission the other two layers (camera-only capture,
// app-wide photo dedup) still cover regardless.
export type PreciseLocationResult = LocationResult | { status: 'imprecise' };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function fetchRawLocation(
  accuracy: Location.Accuracy
): Promise<{ status: 'ok'; lat: number; lng: number; accuracyMeters: number | null } | { status: 'denied' } | { status: 'error' }> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return { status: 'denied' };

  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy });
    return { status: 'ok', lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyMeters: pos.coords.accuracy };
  } catch {
    return { status: 'error' };
  }
}

export async function getCurrentRoundedLocation(): Promise<LocationResult> {
  const result = await fetchRawLocation(Location.Accuracy.Balanced);
  return result.status === 'ok' ? { status: 'ok', lat: round2(result.lat), lng: round2(result.lng) } : result;
}

// Comfortably tighter than the half-mile (805m) venue-distance threshold
// this feeds (server/src/complete.ts), while still tolerating ordinary
// urban/light-indoor GPS degradation — real fixes are typically ~10-50m
// outdoors, ~100-150m in worse conditions. Tunable.
const MAX_TRUSTED_ACCURACY_METERS = 150;

// High (not Balanced) — this fix feeds a real proximity check, so it's worth
// the extra accuracy; still a single one-shot request, not a background watch.
export async function getCurrentPreciseLocation(): Promise<PreciseLocationResult> {
  const result = await fetchRawLocation(Location.Accuracy.High);
  if (result.status !== 'ok') return result;
  if (result.accuracyMeters == null || result.accuracyMeters > MAX_TRUSTED_ACCURACY_METERS) return { status: 'imprecise' };
  return { status: 'ok', lat: result.lat, lng: result.lng };
}
