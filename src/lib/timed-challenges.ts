// Gumpa — fetches currently-live, time-boxed developer Challenges (see
// server/src/timed-challenges.ts). Distinct from the recurring Tasks system
// (local-challenges.ts / dev-challenges.ts) — the deadline here is global
// and absolute, the same instant for every user, computed server-side.

import { apiFetch } from '@/lib/api';

export interface TimedChallenge {
  id: string;
  title: string;
  desc: string;
  tokens: number;
  cat: string;
  proofType: 'camera' | 'screenshot' | 'either';
  deadlineAt: number;
}

export async function fetchTimedChallenges(token: string): Promise<TimedChallenge[]> {
  const res = await apiFetch('/timed-challenges', { token });
  if (!res.ok) throw new Error(`GET /timed-challenges failed: ${res.status}`);

  const data = (await res.json()) as { challenges?: TimedChallenge[] };
  return Array.isArray(data.challenges) ? data.challenges : [];
}
