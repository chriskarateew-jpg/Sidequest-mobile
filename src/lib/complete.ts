// Sidequest — records a quest completion server-side (POST /complete). This
// is also where tokens actually get credited and feed posts get written —
// the local store applies its own optimistic state immediately (see
// src/lib/store.ts), and this call's response reconciles it to the
// authoritative value.

import { apiFetch } from '@/lib/api';

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

export async function submitCompletion(params: {
  token: string;
  challengeId: string;
  photoBase64?: string;
  mediaType?: string;
  photoProof?: string;
  caption?: string;
}): Promise<CompleteResult | null> {
  try {
    const { token, ...body } = params;
    const res = await apiFetch('/complete', { method: 'POST', token, body });
    const data = (await res.json()) as Partial<CompleteResult> & { error?: string };
    if (!res.ok || !data.completion) return null;
    return data as CompleteResult;
  } catch {
    // the completion round-trip just won't happen this time — the caller
    // falls back to the local optimistic state, already applied
    return null;
  }
}
