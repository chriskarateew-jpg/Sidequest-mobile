// Gumpa — fetches developer-authored custom challenges (see
// server/src/dev-challenges.ts). Same shape/trust level as
// src/lib/local-challenges.ts: server-authoritative, just merged into the
// suggestion pool alongside the static catalog.

import { apiFetch } from '@/lib/api';
import type { Challenge } from '@/lib/data';

export async function fetchCustomChallenges(token: string): Promise<Challenge[]> {
  const res = await apiFetch('/challenges/custom', { token });
  if (!res.ok) throw new Error(`GET /challenges/custom failed: ${res.status}`);

  const data = (await res.json()) as { challenges?: Challenge[] };
  return Array.isArray(data.challenges) ? data.challenges : [];
}
