// Gumpa — fetches location-flavored challenges tied to real nearby
// places (see server/src/local-challenges.ts). Throws on a network error or
// a non-OK response — the caller (store.ts's refreshLocalChallenges) is the
// one that decides how to surface that, so this doesn't flatten "reached
// the server and legitimately found nothing" and "never reached the server
// at all" into the same silent empty array.

import { apiFetch } from '@/lib/api';
import type { Challenge } from '@/lib/data';

export async function fetchLocalChallenges(params: { token: string; lat: number; lng: number }): Promise<Challenge[]> {
  const res = await apiFetch(`/local-challenges?lat=${params.lat}&lng=${params.lng}`, { token: params.token });
  if (!res.ok) throw new Error(`GET /local-challenges failed: ${res.status}`);

  const data = (await res.json()) as { challenges?: Challenge[]; cityImage?: string | null };
  const challenges = Array.isArray(data.challenges) ? data.challenges : [];
  // Each challenge carries its own venue image when the server found one;
  // only fall back to the region's shared image for a challenge that didn't
  // get its own (see server/src/local-challenges.ts's respondWithChallenges).
  return challenges.map((c) => ({ ...c, isLocal: true, bgImage: c.bgImage ?? data.cityImage ?? undefined }));
}
