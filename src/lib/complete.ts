// Gumpa — records a quest completion server-side (POST /complete). This
// is also where tokens actually get credited and feed posts get written —
// the local store applies its own optimistic state immediately (see
// src/lib/store.ts), and this call's response reconciles it to the
// authoritative value.

import { apiFetch } from '@/lib/api';
import type { Challenge } from '@/lib/data';
import { periodKeyFor, useGumpaStore } from '@/lib/store';

export interface CompleteResult {
  completion: {
    challengeId: string;
    periodKey: string;
    verifyType: 'photo' | 'streak';
    progress: number;
    target: number;
    status: 'complete' | 'in_progress';
    postId: string | null;
  };
  tokens?: number;
}

export type CompleteOutcome =
  | { status: 'ok'; result: CompleteResult }
  // A deliberate server-side refusal (duplicate photo, GPS mismatch) — the
  // completion/tokens here are the server's authoritative current state,
  // used to roll back whatever the caller already applied optimistically.
  | { status: 'rejected'; reason: string; result: CompleteResult }
  // Network/transient failure — caller keeps its existing optimistic state
  // untouched, same as this call always behaved before.
  | { status: 'error' };

export async function submitCompletion(params: {
  token: string;
  challengeId: string;
  photoBase64?: string;
  mediaType?: string;
  photoProof?: string;
  caption?: string;
  rating?: number;
  hashThumbnailBase64?: string;
  lat?: number;
  lng?: number;
}): Promise<CompleteOutcome> {
  try {
    const { token, ...body } = params;
    const res = await apiFetch('/complete', { method: 'POST', token, body });
    const data = (await res.json()) as Partial<CompleteResult> & { error?: string; reason?: string };

    if (res.status === 409 && data.completion) {
      return { status: 'rejected', reason: data.reason || data.error || 'Submission rejected.', result: data as CompleteResult };
    }
    if (!res.ok || !data.completion) return { status: 'error' };
    return { status: 'ok', result: data as CompleteResult };
  } catch {
    return { status: 'error' };
  }
}

// Shared by both submission paths (an in-progress streak check-in in
// challenge-card.tsx, and the review screen's Post button) — reconciles the
// local optimistic state against the server's authoritative response. Never
// throws or shows anything itself; callers decide what to do with a
// 'rejected' outcome (a deliberate server-side refusal, not a network blip).
export async function reconcileSubmission(challenge: Challenge, submit: () => Promise<CompleteOutcome>): Promise<CompleteOutcome> {
  const outcome = await submit();
  if (outcome.status === 'error') return outcome; // transient/network — keep the optimistic state already applied

  if (typeof outcome.result.tokens === 'number') useGumpaStore.getState().syncTokens(outcome.result.tokens);
  useGumpaStore.getState().syncCompletion(challenge.id, periodKeyFor(challenge.cadence), outcome.result.completion);
  return outcome;
}
