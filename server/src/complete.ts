// Sidequest — the single entry point for recording a quest completion,
// across both verify methods (photo/streak — every challenge is photo-
// verified, streak just spreads that across several check-ins). Replaces
// the old POST /feed: this is where the `completions` ledger (one row per
// user+challenge+period, UNIQUE-constrained) gets claimed, tokens get
// credited, duels get resolved, and — for photo/streak-completing
// check-ins — a feed post gets written.

import { requireAuth } from './auth';
import { resolveCatalogEntry } from './catalog';
import { hashToken, verifyToken } from './crypto';
import type { Env } from './env';
import { resolveDuelOnCompletion } from './duels';
import { base64ToBytes, error, json, safeJson } from './http';
import { computePeriodKey, todayKey } from './period';
import { checkRateLimit } from './ratelimit';
import { creditTokens } from './tokens';

const MAX_CAPTION_LENGTH = 240;

// Trims and caps an optional user-written caption; blank input normalizes to
// null so empty strings never get stored as if they were a real caption.
function normalizeCaption(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, MAX_CAPTION_LENGTH);
  return trimmed || null;
}

interface CompletionRow {
  id: string;
  user_id: string;
  challenge_id: string;
  period_key: string;
  verify_type: 'photo' | 'streak';
  progress: number;
  target: number;
  status: 'in_progress' | 'complete';
  last_checkin_day: string | null;
  post_id: string | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

// Checks the same short-lived photoProof token /verify mints for a photo
// challenge — binds it to this user, this challenge, and these exact photo
// bytes, so a client can't skip verification or swap in a different photo
// after the fact. Shared by the 'photo' branch and every streak check-in
// below, since every completion path is photo-verified now.
async function requirePhotoProof(
  env: Env,
  userId: string,
  challengeId: string,
  body: Record<string, unknown>
): Promise<{ photoBase64: string; mediaType: string } | Response> {
  const photoBase64 = body.photoBase64 as string | undefined;
  const mediaType = (body.mediaType as string | undefined) ?? 'image/jpeg';
  const photoProof = body.photoProof as string | undefined;
  if (!photoBase64 || !photoProof) return error('Missing photoBase64 or photoProof');

  const payload = await verifyToken(photoProof, env.JWT_SECRET);
  if (!payload || payload.typ !== 'photo-verify' || payload.sub !== userId || payload.challengeId !== challengeId) {
    return error('Invalid or expired photo proof', 401);
  }
  if (payload.photoHash !== (await hashToken(photoBase64))) {
    return error('Photo does not match the verified proof', 401);
  }

  return { photoBase64, mediaType };
}

export async function handleComplete(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  if (!(await checkRateLimit(env, `complete:${auth.id}`, 60, 3600))) {
    return error('Too many completions. Try again later.', 429);
  }

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  const challengeId = body.challengeId as string | undefined;
  const catalogEntry = challengeId ? await resolveCatalogEntry(env, challengeId) : null;
  if (!challengeId || !catalogEntry) return error('Unknown challenge');

  const periodKey = computePeriodKey(catalogEntry.cadence);
  const target = catalogEntry.target ?? 1;

  let row = await env.DB.prepare('SELECT * FROM completions WHERE user_id = ? AND challenge_id = ? AND period_key = ?')
    .bind(auth.id, challengeId, periodKey)
    .first<CompletionRow>();

  if (!row) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO completions (id, user_id, challenge_id, period_key, verify_type, progress, target, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, 'in_progress', ?, ?)`
    )
      .bind(crypto.randomUUID(), auth.id, challengeId, periodKey, catalogEntry.verify, target, Date.now(), Date.now())
      .run();
    row = await env.DB.prepare('SELECT * FROM completions WHERE user_id = ? AND challenge_id = ? AND period_key = ?')
      .bind(auth.id, challengeId, periodKey)
      .first<CompletionRow>();
  }
  if (!row) return error('Could not record completion', 500);
  if (row.status === 'complete') return error('Already completed for this period', 409);

  const caption = normalizeCaption(body.caption);
  let justCompletedPostId: string | null = null;

  if (catalogEntry.verify === 'photo') {
    const proof = await requirePhotoProof(env, auth.id, challengeId, body);
    if (proof instanceof Response) return proof;

    const postId = crypto.randomUUID();
    const ext = proof.mediaType.includes('png') ? 'png' : 'jpg';
    const key = `posts/${postId}.${ext}`;
    await env.PHOTOS.put(key, base64ToBytes(proof.photoBase64), { httpMetadata: { contentType: proof.mediaType } });
    await env.DB.prepare(
      'INSERT INTO posts (id, user_id, quest_title, quest_desc, photo_key, challenge_id, caption, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(postId, auth.id, catalogEntry.title, catalogEntry.desc, key, challengeId, caption, Date.now())
      .run();

    const claim = await env.DB.prepare(
      "UPDATE completions SET status = 'complete', progress = target, post_id = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'in_progress'"
    )
      .bind(postId, Date.now(), Date.now(), row.id)
      .run();
    if (claim.meta.changes > 0) justCompletedPostId = postId;
  } else {
    // streak — one photo-verified check-in per calendar day, until target reached.
    const today = todayKey();
    if (row.last_checkin_day === today) return error('Already checked in today', 409);

    const proof = await requirePhotoProof(env, auth.id, challengeId, body);
    if (proof instanceof Response) return proof;

    const newProgress = row.progress + 1;
    if (newProgress >= row.target) {
      // Only the completing check-in's photo gets uploaded/posted — earlier
      // check-ins in the streak still had to pass photo verification, but
      // there's no reason to store N-1 redundant photos for a streak that
      // only ever surfaces one feed post.
      const postId = crypto.randomUUID();
      const ext = proof.mediaType.includes('png') ? 'png' : 'jpg';
      const key = `posts/${postId}.${ext}`;
      await env.PHOTOS.put(key, base64ToBytes(proof.photoBase64), { httpMetadata: { contentType: proof.mediaType } });
      await env.DB.prepare(
        'INSERT INTO posts (id, user_id, quest_title, quest_desc, photo_key, challenge_id, caption, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(postId, auth.id, catalogEntry.title, catalogEntry.desc, key, challengeId, caption, Date.now())
        .run();

      const claim = await env.DB.prepare(
        "UPDATE completions SET progress = ?, last_checkin_day = ?, status = 'complete', post_id = ?, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'in_progress'"
      )
        .bind(newProgress, today, postId, Date.now(), Date.now(), row.id)
        .run();
      if (claim.meta.changes > 0) justCompletedPostId = postId;
    } else {
      await env.DB.prepare(
        "UPDATE completions SET progress = ?, last_checkin_day = ?, updated_at = ? WHERE id = ? AND status = 'in_progress'"
      )
        .bind(newProgress, today, Date.now(), row.id)
        .run();

      return json({
        completion: {
          challengeId,
          periodKey,
          verifyType: catalogEntry.verify,
          progress: newProgress,
          target: row.target,
          status: 'in_progress',
          postId: null,
        },
      });
    }
  }

  let tokens: number | undefined;
  if (justCompletedPostId) {
    tokens = await creditTokens(env, auth.id, catalogEntry.tokens, 'quest_complete', challengeId);

    const duelPayoutBalance = await resolveDuelOnCompletion(env, auth.id, challengeId);
    if (duelPayoutBalance !== null) tokens = duelPayoutBalance;
  }

  const finalRow = await env.DB.prepare('SELECT * FROM completions WHERE id = ?').bind(row.id).first<CompletionRow>();

  return json({
    completion: {
      challengeId,
      periodKey,
      verifyType: catalogEntry.verify,
      progress: finalRow?.progress ?? row.target,
      target: row.target,
      status: finalRow?.status ?? 'complete',
      postId: justCompletedPostId,
    },
    tokens,
    post: justCompletedPostId
      ? { id: justCompletedPostId, username: auth.username, questTitle: catalogEntry.title, questDesc: catalogEntry.desc, caption }
      : null,
  });
}
