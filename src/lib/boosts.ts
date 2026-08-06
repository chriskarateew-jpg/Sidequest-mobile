// Gumpa — fetches currently-active developer token-payout boosts (see
// server/src/boosts.ts). Keyed by challengeId so any card — static, local,
// or custom — can look up whether it's boosted right now.

import { apiFetch } from '@/lib/api';

export interface ActiveBoost {
  tokens: number;
  endsAt: number;
}

export async function fetchActiveBoosts(token: string): Promise<Record<string, ActiveBoost>> {
  const res = await apiFetch('/boosts/active', { token });
  if (!res.ok) throw new Error(`GET /boosts/active failed: ${res.status}`);

  const data = (await res.json()) as { boosts?: { challengeId: string; tokens: number; endsAt: number }[] };
  const boosts = Array.isArray(data.boosts) ? data.boosts : [];
  const byChallengeId: Record<string, ActiveBoost> = {};
  for (const b of boosts) byChallengeId[b.challengeId] = { tokens: b.tokens, endsAt: b.endsAt };
  return byChallengeId;
}
