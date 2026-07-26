// Sidequest — coarse device location, used only to suggest tasks tied to
// real places nearby. One-shot fetch, no background watch. Coordinates are
// rounded here before ever leaving the device (the server independently
// re-rounds regardless — this is defense in depth, not the only guard).

import * as Location from 'expo-location';

export type LocationResult = { status: 'ok'; lat: number; lng: number } | { status: 'denied' } | { status: 'error' };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getCurrentRoundedLocation(): Promise<LocationResult> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return { status: 'denied' };

  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { status: 'ok', lat: round2(pos.coords.latitude), lng: round2(pos.coords.longitude) };
  } catch {
    return { status: 'error' };
  }
}
