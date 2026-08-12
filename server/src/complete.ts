// Gumpa — the single entry point for recording a quest completion,
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
import { haversineMeters } from './geo';
import { base64ToBytes, error, json, safeJson } from './http';
import { computePeriodKey, todayKey } from './period';
import { computeDHash, findDuplicateHash, recordPhotoHash } from './photo-hash';
import { checkRateLimit } from './ratelimit';
import { getActivePersonalBoostMultiplier } from './store';
import { userHasGumpaPlus } from './subscriptions';
import { checkTimedChallengeWindow } from './timed-challenges';
import { creditTokens, getTokenBalance, type CatalogEntry } from './tokens';

// A time-boxed Challenge only ever needs one completion ever per user —
// its deadline is global, not tied to any daily/weekly/monthly period — so
// it gets a single fixed period key instead of one computed from cadence.
// The completions table's existing UNIQUE(user_id, challenge_id, period_key)
// then gives "already completed" idempotency for free with no new table.
const TIMED_CHALLENGE_PERIOD_KEY = 'once';

const MAX_CAPTION_LENGTH = 240;

// Trims and caps an optional user-written caption; blank input normalizes to
// null so empty strings never get stored as if they were a real caption.
function normalizeCaption(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, MAX_CAPTION_LENGTH);
  return trimmed || null;
}

// The client's post-verification review screen sends an optional 1-5 star
// rating of the task itself — anything else (missing, out of range, not an
// integer) normalizes to null rather than getting stored as a bogus rating.
function normalizeRating(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  return raw >= 1 && raw <= 5 ? raw : null;
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

// Half a mile — the default when a location-bound entry doesn't specify its
// own radius (every local_challenges row, since those aren't
// developer-configurable). Compared against a precise GPS fix
// (src/lib/photo.ts's getCurrentPreciseLocation), not the app's coarse
// ~1km-grid location — real device GPS accuracy is typically ~10-50m, worse
// indoors/urban canyon (up to ~100-150m), so this is a deliberately generous
// "same general vicinity" check on top of that, not a tight pin-to-pin
// match. This is one layer among three (camera-only capture, this GPS
// check, app-wide photo dedup below), not the only fraud defense. Note:
// recordPhotoHash rounds lat/lng back down before persisting — this
// threshold only governs the in-request comparison, not what ends up in
// storage. A developer-authored Task/Challenge can set its own tighter or
// looser radius instead (see location-fields.ts) — catalogEntry.radiusMeters
// overrides this default when present.
const LOCAL_DISTANCE_THRESHOLD_METERS = 805; // 0.5 mi ≈ 804.67 m

function completionResponseShape(row: CompletionRow) {
  return {
    challengeId: row.challenge_id,
    periodKey: row.period_key,
    verifyType: row.verify_type,
    progress: row.progress,
    target: row.target,
    status: row.status,
    postId: row.post_id,
  };
}

// Builds the same response shape a successful /complete returns
// ({completion, tokens}) so the client's rejection handling can reuse its
// existing reconciliation (syncCompletion/syncTokens) to roll back whatever
// it already applied optimistically — see src/lib/complete.ts.
async function rejectSubmission(env: Env, userId: string, row: CompletionRow, errorCode: string, reason: string): Promise<Response> {
  const tokens = await getTokenBalance(env, userId);
  return json({ error: errorCode, reason, completion: completionResponseShape(row), tokens }, 409);
}

// Runs right after requirePhotoProof succeeds, before any DB write, for
// every photo-verified submission (the one-shot 'photo' branch and every
// streak check-in, not just the completing one) — otherwise the same photo
// could be resubmitted daily across a streak, or reused across challenges.
async function checkPhotoFraud(
  env: Env,
  userId: string,
  catalogEntry: CatalogEntry,
  row: CompletionRow,
  body: Record<string, unknown>
): Promise<{ hash: string; lat?: number; lng?: number } | Response> {
  const hashThumbnailBase64 = body.hashThumbnailBase64 as string | undefined;
  if (!hashThumbnailBase64) return error('Missing hashThumbnailBase64');
  const lat = typeof body.lat === 'number' ? body.lat : undefined;
  const lng = typeof body.lng === 'number' ? body.lng : undefined;

  const hash = await computeDHash(hashThumbnailBase64);
  if (await findDuplicateHash(env, hash)) {
    return rejectSubmission(env, userId, row, 'duplicate_photo', 'Exact photo already submitted.');
  }

  // Only local/venue challenges and developer-pinned Tasks/Challenges carry
  // a target location to check against — generic challenges ("do 20
  // push-ups") have none.
  if (catalogEntry.placeLat != null && catalogEntry.placeLng != null && lat != null && lng != null) {
    const distanceMeters = haversineMeters(lat, lng, catalogEntry.placeLat, catalogEntry.placeLng);
    const threshold = catalogEntry.radiusMeters ?? LOCAL_DISTANCE_THRESHOLD_METERS;
    if (distanceMeters > threshold) {
      const placeName = catalogEntry.placeName ?? 'this place';
      return rejectSubmission(env, userId, row, 'location_mismatch', `Photo location doesn't match ${placeName}.`);
    }
  }

  return { hash, lat, lng };
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

  // Re-checked independently of GET /challenges/custom's listing filter —
  // that filter is a UX nicety (a non-subscriber never sees the id to begin
  // with), this is the real enforcement against a client that already has
  // the id some other way. See docs/gumpa-plus-perks-roadmap.md Phase 4.
  if (catalogEntry.earlyAccessOnly && !(await userHasGumpaPlus(env, auth.id))) {
    return error('This task is in early access for Gumpa+ subscribers right now.', 403);
  }

  if (catalogEntry.kind === 'timed') {
    const window = await checkTimedChallengeWindow(env, challengeId);
    if (!window.ok) return error(window.reason, 409);
  }

  const periodKey = catalogEntry.kind === 'timed' ? TIMED_CHALLENGE_PERIOD_KEY : computePeriodKey(catalogEntry.cadence);
  const target = catalogEntry.target ?? 1;

  // A personally-purchased Store boost (server/src/store.ts) multiplies on
  // top of whatever catalogEntry.tokens already resolved to (which may
  // itself include a developer-granted challenge-wide boost, see
  // catalog.ts) — computed once here so the posts.tokens_earned rows below
  // and the actual credit at the bottom of this function never disagree.
  const personalMultiplier = await getActivePersonalBoostMultiplier(env, auth.id);
  const effectiveTokens = Math.round(catalogEntry.tokens * personalMultiplier);

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
  const rating = normalizeRating(body.rating);
  let justCompletedPostId: string | null = null;

  if (catalogEntry.verify === 'photo') {
    const proof = await requirePhotoProof(env, auth.id, challengeId, body);
    if (proof instanceof Response) return proof;

    const fraudCheck = await checkPhotoFraud(env, auth.id, catalogEntry, row, body);
    if (fraudCheck instanceof Response) return fraudCheck;
    await recordPhotoHash(env, { userId: auth.id, challengeId, hash: fraudCheck.hash, lat: fraudCheck.lat, lng: fraudCheck.lng });

    const postId = crypto.randomUUID();
    const ext = proof.mediaType.includes('png') ? 'png' : 'jpg';
    const key = `posts/${postId}.${ext}`;
    await env.PHOTOS.put(key, base64ToBytes(proof.photoBase64), { httpMetadata: { contentType: proof.mediaType } });
    await env.DB.prepare(
      'INSERT INTO posts (id, user_id, quest_title, quest_desc, photo_key, challenge_id, caption, rating, tokens_earned, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(postId, auth.id, catalogEntry.title, catalogEntry.desc, key, challengeId, caption, rating, effectiveTokens, Date.now())
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

    const fraudCheck = await checkPhotoFraud(env, auth.id, catalogEntry, row, body);
    if (fraudCheck instanceof Response) return fraudCheck;
    await recordPhotoHash(env, { userId: auth.id, challengeId, hash: fraudCheck.hash, lat: fraudCheck.lat, lng: fraudCheck.lng });

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
        'INSERT INTO posts (id, user_id, quest_title, quest_desc, photo_key, challenge_id, caption, rating, tokens_earned, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(postId, auth.id, catalogEntry.title, catalogEntry.desc, key, challengeId, caption, rating, effectiveTokens, Date.now())
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
    tokens = await creditTokens(env, auth.id, effectiveTokens, 'quest_complete', challengeId);

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
