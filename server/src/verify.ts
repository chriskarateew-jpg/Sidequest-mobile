// Gumpa — quest photo verification. Takes a submitted photo + the
// quest's id and asks Claude whether the photo plausibly shows that quest
// being completed right now. The title/desc used in the prompt are resolved
// server-side from the trusted catalog (never from the client) — otherwise a
// client could send an easy title for a hard challengeId and trivially pass
// verification for anything. On a match, mints a short-lived proof token
// (bound to the user, challenge, and exact photo bytes) that POST /complete
// requires for every challenge — this stops a client from skipping
// verification entirely, or verifying with one photo and submitting a
// different one.

import { requireAuth } from './auth';
import { resolveCatalogEntry } from './catalog';
import { hashToken, signToken } from './crypto';
import type { Env } from './env';
import { error, json, safeJson } from './http';
import { checkRateLimit } from './ratelimit';
import { checkTimedChallengeWindow } from './timed-challenges';

const MODEL = 'claude-haiku-4-5-20251001';
const PROOF_TTL_SECONDS = 5 * 60;

export async function handleVerify(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  if (!(await checkRateLimit(env, `verify:${auth.id}`, 20, 3600))) {
    return error('Too many verification attempts. Try again later.', 429);
  }

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  const photoBase64 = body.photoBase64 as string | undefined;
  const challengeId = body.challengeId as string | undefined;
  const mediaType = (body.mediaType as string | undefined) ?? 'image/jpeg';
  if (!photoBase64 || !challengeId) return error('Missing photoBase64 or challengeId');

  const catalogEntry = await resolveCatalogEntry(env, challengeId);
  if (!catalogEntry) return error('Unknown challenge');

  if (catalogEntry.kind === 'timed') {
    // Blocks minting a fresh proof token for something already past its
    // deadline — otherwise a client could verify right at the wire and
    // race the actual /complete call in after the window closes.
    const window = await checkTimedChallengeWindow(env, challengeId);
    if (!window.ok) return error(window.reason, 409);
  }

  const { title, desc, proofAccept, proofReject } = catalogEntry;

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: photoBase64 } },
              { type: 'text', text: buildPrompt(title, desc, proofAccept, proofReject) },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    return error(`Could not reach verification model: ${String(err)}`, 502);
  }

  if (!anthropicRes.ok) {
    const text = await anthropicRes.text();
    return error(`Verification model error: ${anthropicRes.status} ${text}`, 502);
  }

  const data = (await anthropicRes.json()) as { content?: { text?: string }[] };
  const raw = data.content?.[0]?.text ?? '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return error('Could not parse verification response', 502);

  try {
    const parsed = JSON.parse(match[0]);
    const matches = !!parsed.matches;
    if (!matches) return json({ matches: false, reason: String(parsed.reason ?? '') });

    const photoHash = await hashToken(photoBase64);
    const photoProof = await signToken(
      { typ: 'photo-verify', sub: auth.id, challengeId, photoHash },
      env.JWT_SECRET,
      PROOF_TTL_SECONDS
    );
    return json({ matches: true, reason: String(parsed.reason ?? ''), photoProof });
  } catch {
    return error('Could not parse verification response', 502);
  }
}

// proofAccept/proofReject are optional per-task hints authored by a
// developer via the dev_challenges admin API (see dev-challenges.ts's
// MAX_PROOF_HINT_LENGTH) — short guidance phrases only, already
// length-capped at write time. Re-capped here too as defense in depth, in
// case a row is ever written by something other than that endpoint (e.g. a
// future migration script). They're appended as extra criteria for this
// specific task, never allowed to replace the surrounding instructions —
// a task with neither set produces the exact same prompt as before this
// function grew these two parameters.
const PROOF_HINT_DEFENSIVE_CAP = 200;

// Exported so the admin dashboard's prompt-preview endpoint
// (dev-challenges.ts's handleAdminPreviewPrompt) calls this exact function
// instead of a reimplementation that could drift out of sync — see
// docs/task-database-roadmap.md Phase 5.
export function buildPrompt(title: string, desc?: string, proofAccept?: string, proofReject?: string): string {
  return [
    'You are checking photo proof submitted for a personal-growth app challenge.',
    `Challenge: "${title}"${desc ? `\nDetails: ${desc}` : ''}`,
    '',
    'Does this image plausibly show someone completing this specific challenge right now?',
    'Be reasonably lenient — a genuine, in-the-moment attempt counts even if imperfect or low-quality.',
    'A screenshot is acceptable only when the challenge details above explicitly call for one (a tracked app number, a sent message, a transfer confirmation) — reject a screenshot for any challenge whose proof should be a real-world photo instead.',
    'Reject images that are clearly unrelated to this specific challenge, a stock photo, or obviously reused from an unrelated context.',
    ...(proofAccept ? [`Additionally, for this specific task, accept: ${proofAccept.slice(0, PROOF_HINT_DEFENSIVE_CAP)}`] : []),
    ...(proofReject ? [`Additionally, for this specific task, reject: ${proofReject.slice(0, PROOF_HINT_DEFENSIVE_CAP)}`] : []),
    '',
    'Respond with ONLY minified JSON, no other text: {"matches": boolean, "reason": "one short sentence"}',
  ].join('\n');
}
