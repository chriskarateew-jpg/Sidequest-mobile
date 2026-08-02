// Gumpa — calls the verification endpoint to check that a submitted
// photo plausibly shows a given quest being completed. The server resolves
// the challenge's title/desc itself from its trusted catalog (never from
// the client) to build the AI prompt. The Anthropic API key lives only on
// the server; the app just sees a verdict. On a match, the server also
// returns a short-lived photoProof token that POST /complete requires — it
// binds the verdict to this user, this challenge, and these exact photo
// bytes, so a client can't skip verification or swap in a different photo
// after the fact.

import { apiFetch } from '@/lib/api';

export type VerifyResult =
  | { status: 'match'; photoProof: string }
  | { status: 'no-match'; reason: string }
  | { status: 'error' };

export async function verifyPhoto(params: {
  token: string;
  photoBase64: string;
  mediaType: string;
  challengeId: string;
}): Promise<VerifyResult> {
  try {
    const { token, ...body } = params;
    const res = await apiFetch('/verify', { method: 'POST', token, body });
    if (!res.ok) return { status: 'error' };

    const data = (await res.json()) as { matches?: boolean; reason?: string; photoProof?: string };
    if (data.matches && data.photoProof) return { status: 'match', photoProof: data.photoProof };
    if (data.matches) return { status: 'error' }; // matched but no proof token — shouldn't happen, treat as unverifiable
    return { status: 'no-match', reason: data.reason || "Doesn't look like a match. Try again." };
  } catch {
    return { status: 'error' };
  }
}
