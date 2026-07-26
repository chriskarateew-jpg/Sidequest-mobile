// Sidequest — quest photo verification. Takes a submitted photo + the
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
  const { title, desc } = catalogEntry;

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
              { type: 'text', text: buildPrompt(title, desc) },
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

function buildPrompt(title: string, desc?: string): string {
  return [
    'You are checking photo proof submitted for a personal-growth app challenge.',
    `Challenge: "${title}"${desc ? `\nDetails: ${desc}` : ''}`,
    '',
    'Does this image plausibly show someone completing this specific challenge right now?',
    'Be reasonably lenient — a genuine, in-the-moment attempt counts even if imperfect or low-quality.',
    'A screenshot is acceptable only when the challenge details above explicitly call for one (a tracked app number, a sent message, a transfer confirmation) — reject a screenshot for any challenge whose proof should be a real-world photo instead.',
    'Reject images that are clearly unrelated to this specific challenge, a stock photo, or obviously reused from an unrelated context.',
    '',
    'Respond with ONLY minified JSON, no other text: {"matches": boolean, "reason": "one short sentence"}',
  ].join('\n');
}
