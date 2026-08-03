import { requireAuth } from './auth';
import type { Env } from './env';
import { sendRecommendationEmail } from './email';
import { base64ToBytes, error, json, safeJson } from './http';
import { checkRateLimit } from './ratelimit';

const MAX_RECOMMENDATION_LENGTH = 2000;

export async function handleSetPrivacy(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const body = await safeJson(request);
  if (!body || typeof body.isPublic !== 'boolean') return error('Missing isPublic (boolean)');

  await env.DB.prepare('UPDATE users SET is_public = ? WHERE id = ?')
    .bind(body.isPublic ? 1 : 0, auth.id)
    .run();

  return json({ ok: true, isPublic: body.isPublic });
}

// Every upload gets its own R2 key (never overwrites a previous avatar's
// key) even though only the latest one is ever linked from avatar_key —
// handleGetPhoto serves every object with a year-long `immutable`
// cache-control header, so re-using a fixed per-user key would mean anyone
// who'd already loaded the old photo at that URL keeps seeing it until that
// cache expires. A fresh key per upload sidesteps the problem entirely: the
// URL the client requests changes the moment avatarKey changes, so there's
// never a stale cached response to serve. The old object is simply orphaned
// in R2 — a few stray images is a non-issue at this scale, not worth a
// cleanup job.
export async function handleSetAvatar(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  const pictureBase64 = body.pictureBase64 as string | undefined;
  const mediaType = (body.mediaType as string | undefined) ?? 'image/jpeg';
  if (!pictureBase64) return error('Missing pictureBase64');

  const ext = mediaType.includes('png') ? 'png' : 'jpg';
  const key = `avatars/${auth.id}-${Date.now()}.${ext}`;
  await env.PHOTOS.put(key, base64ToBytes(pictureBase64), { httpMetadata: { contentType: mediaType } });
  await env.DB.prepare('UPDATE users SET avatar_key = ? WHERE id = ?').bind(key, auth.id).run();

  return json({ ok: true, avatarKey: key });
}

// Sends a user-submitted recommendation to the app's own inbox (see
// sendRecommendationEmail) — not stored anywhere, purely a mail relay.
// Rate-limited per user since it's an outbound-email trigger, same as the
// verification/reset-email endpoints in auth.ts.
export async function handleRecommend(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  if (!(await checkRateLimit(env, `recommend:${auth.id}`, 5, 3600))) {
    return error('Too many requests. Try again later.', 429);
  }

  const body = await safeJson(request);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return error('Missing message');
  if (message.length > MAX_RECOMMENDATION_LENGTH) {
    return error(`Message must be ${MAX_RECOMMENDATION_LENGTH} characters or fewer`);
  }

  const sent = await sendRecommendationEmail(env, auth.username, message);
  if (!sent) return error("Couldn't send your recommendation. Try again later.", 502);

  return json({ ok: true });
}
