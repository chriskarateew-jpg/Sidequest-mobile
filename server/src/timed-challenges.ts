// Gumpa — developer-only time-boxed "Challenges" (distinct from the
// recurring cadence-based dev_challenges "Tasks" in dev-challenges.ts). The
// deadline is global and absolute (created_at + duration_minutes), the same
// instant for every user — not a per-user countdown. "Who already
// completed it" is answered by the existing completions table
// (period_key='once' for this kind, see complete.ts), so there's no
// separate per-user assignment table to keep in sync.

import { requireAuth, requireDeveloper } from './auth';
import type { Cadence, ProofType } from './tokens';
import type { Env } from './env';
import { error, json, safeJson } from './http';
import { parseOptionalLocation, type LocationFields } from './location-fields';

const VALID_CATS = ['fitness', 'finance', 'social', 'courage', 'explore', 'mind'];
const VALID_PROOF: ProofType[] = ['camera', 'screenshot', 'either'];
const MAX_TOKENS = 2000;
const MAX_TITLE_LENGTH = 100;
const MAX_DESC_LENGTH = 240;
const MAX_DURATION_MINUTES = 60 * 24 * 30; // 30 days — generous but bounded

// A placeholder cadence for CatalogEntry's required field — never actually
// read for a timed challenge, since complete.ts branches on `kind` before
// ever computing a cadence-based period key (see complete.ts).
export const TIMED_CHALLENGE_CADENCE_PLACEHOLDER: Cadence = 'daily';

export interface TimedChallengeRow {
  id: string;
  title: string;
  desc: string;
  tokens: number;
  cat: string;
  proof_type: string;
  duration_minutes: number;
  place_lat: number | null;
  place_lng: number | null;
  radius_meters: number | null;
  active: number;
  created_by: string;
  created_at: number;
  updated_at: number;
}

function deadlineOf(row: TimedChallengeRow): number {
  return row.created_at + row.duration_minutes * 60 * 1000;
}

export async function getTimedChallengeById(env: Env, id: string): Promise<TimedChallengeRow | null> {
  return env.DB.prepare('SELECT * FROM timed_challenges WHERE id = ?').bind(id).first<TimedChallengeRow>();
}

// The actual enforcement for /verify and /complete — global and stateless,
// no per-user row to look up. The client-shown countdown is display only.
export async function checkTimedChallengeWindow(env: Env, challengeId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const row = await getTimedChallengeById(env, challengeId);
  if (!row) return { ok: false, reason: 'Unknown challenge' };
  if (!row.active) return { ok: false, reason: 'This challenge has ended.' };
  if (Date.now() >= deadlineOf(row)) return { ok: false, reason: 'This challenge\'s time window has expired.' };
  return { ok: true };
}

function toClientShape(row: TimedChallengeRow) {
  return {
    id: row.id,
    title: row.title,
    desc: row.desc,
    tokens: row.tokens,
    cat: row.cat,
    proofType: row.proof_type,
    deadlineAt: deadlineOf(row),
  };
}

function toAdminShape(row: TimedChallengeRow) {
  return {
    id: row.id,
    title: row.title,
    desc: row.desc,
    tokens: row.tokens,
    cat: row.cat,
    proofType: row.proof_type,
    durationMinutes: row.duration_minutes,
    placeLat: row.place_lat,
    placeLng: row.place_lng,
    radiusMeters: row.radius_meters,
    active: !!row.active,
    deadlineAt: deadlineOf(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseChallengeBody(body: Record<string, unknown>): {
  title: string;
  desc: string;
  tokens: number;
  cat: string;
  proofType: ProofType;
  durationMinutes: number;
  location: LocationFields | null;
} | Response {
  const title = String(body.title ?? '').trim().slice(0, MAX_TITLE_LENGTH);
  const desc = String(body.desc ?? '').trim().slice(0, MAX_DESC_LENGTH);
  const tokens = Number(body.tokens);
  const cat = String(body.cat ?? '');
  const proofType = String(body.proofType ?? '') as ProofType;
  const durationMinutes = Number(body.durationMinutes);

  if (!title) return error('Title is required');
  if (!desc) return error('Description is required');
  if (!Number.isInteger(tokens) || tokens <= 0 || tokens > MAX_TOKENS) {
    return error(`Tokens must be a whole number between 1 and ${MAX_TOKENS}`);
  }
  if (!VALID_CATS.includes(cat)) return error(`Category must be one of: ${VALID_CATS.join(', ')}`);
  if (!VALID_PROOF.includes(proofType)) return error(`Proof type must be one of: ${VALID_PROOF.join(', ')}`);
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > MAX_DURATION_MINUTES) {
    return error(`Duration must be a whole number of minutes between 1 and ${MAX_DURATION_MINUTES}`);
  }

  const location = parseOptionalLocation(body);
  if (location instanceof Response) return location;

  return { title, desc, tokens, cat, proofType, durationMinutes, location };
}

// GET /timed-challenges — every logged-in user. A pure read: no side
// effects, since the deadline doesn't depend on when any given user looks.
export async function handleListTimedChallenges(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT * FROM timed_challenges
     WHERE active = 1 AND (created_at + duration_minutes * 60000) > ?
     AND id NOT IN (SELECT challenge_id FROM completions WHERE user_id = ? AND status = 'complete')`
  )
    .bind(now, auth.id)
    .all<TimedChallengeRow>();

  return json({ challenges: (results ?? []).map(toClientShape) });
}

export async function handleAdminListTimedChallenges(request: Request, env: Env): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const { results } = await env.DB.prepare('SELECT * FROM timed_challenges ORDER BY created_at DESC').all<TimedChallengeRow>();
  return json({ challenges: (results ?? []).map(toAdminShape) });
}

export async function handleAdminCreateTimedChallenge(request: Request, env: Env): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  const parsed = parseChallengeBody(body);
  if (parsed instanceof Response) return parsed;

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO timed_challenges (id, title, desc, tokens, cat, proof_type, duration_minutes, place_lat, place_lng, radius_meters, active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
  )
    .bind(
      id,
      parsed.title,
      parsed.desc,
      parsed.tokens,
      parsed.cat,
      parsed.proofType,
      parsed.durationMinutes,
      parsed.location?.placeLat ?? null,
      parsed.location?.placeLng ?? null,
      parsed.location?.radiusMeters ?? null,
      auth.id,
      now,
      now
    )
    .run();

  const row = await getTimedChallengeById(env, id);
  return json({ challenge: row ? toAdminShape(row) : null });
}

export async function handleAdminUpdateTimedChallenge(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const existing = await getTimedChallengeById(env, id);
  if (!existing) return error('Not found', 404);

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  if (Object.keys(body).length === 1 && typeof body.active === 'boolean') {
    await env.DB.prepare('UPDATE timed_challenges SET active = ?, updated_at = ? WHERE id = ?')
      .bind(body.active ? 1 : 0, Date.now(), id)
      .run();
  } else {
    const parsed = parseChallengeBody(body);
    if (parsed instanceof Response) return parsed;
    await env.DB.prepare(
      `UPDATE timed_challenges SET title = ?, desc = ?, tokens = ?, cat = ?, proof_type = ?, duration_minutes = ?, place_lat = ?, place_lng = ?, radius_meters = ?, updated_at = ? WHERE id = ?`
    )
      .bind(
        parsed.title,
        parsed.desc,
        parsed.tokens,
        parsed.cat,
        parsed.proofType,
        parsed.durationMinutes,
        parsed.location?.placeLat ?? null,
        parsed.location?.placeLng ?? null,
        parsed.location?.radiusMeters ?? null,
        Date.now(),
        id
      )
      .run();
  }

  const row = await getTimedChallengeById(env, id);
  return json({ challenge: row ? toAdminShape(row) : null });
}

// Soft delete only, same as dev-challenges.ts — deactivating is the manual
// kill switch described in the table's header comment, doesn't erase the
// row (past completions still need it resolvable via catalog.ts).
export async function handleAdminDeleteTimedChallenge(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const result = await env.DB.prepare('UPDATE timed_challenges SET active = 0, updated_at = ? WHERE id = ?').bind(Date.now(), id).run();
  if (result.meta.changes === 0) return error('Not found', 404);
  return json({ ok: true });
}
