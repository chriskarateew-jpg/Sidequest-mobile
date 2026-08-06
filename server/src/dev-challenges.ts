// Gumpa — developer-authored custom challenges. Lets the developer add new
// tasks to the live app (title, description, token payout, proof method)
// without an app-store release. Rows are soft-deleted (active=0), never
// hard-deleted, so an id already handed to a client — or referenced by a
// past completions/posts row — stays resolvable forever (see catalog.ts),
// same rule already used for local_challenges.

import { requireAuth, requireDeveloper } from './auth';
import type { Cadence, ProofType, VerifyType } from './tokens';
import type { Env } from './env';
import { error, json, safeJson } from './http';
import { parseOptionalLocation, type LocationFields } from './location-fields';

const VALID_CADENCES: Cadence[] = ['daily', 'weekly', 'monthly'];
const VALID_CATS = ['fitness', 'finance', 'social', 'courage', 'explore', 'mind'];
const VALID_VERIFY: VerifyType[] = ['photo', 'streak'];
const VALID_PROOF: ProofType[] = ['camera', 'screenshot', 'either'];
const MAX_TOKENS = 2000;
const MAX_TITLE_LENGTH = 100;
const MAX_DESC_LENGTH = 240;

export interface DevChallengeRow {
  id: string;
  title: string;
  desc: string;
  tokens: number;
  cadence: string;
  cat: string;
  verify_type: string;
  proof_type: string;
  streak_target: number | null;
  place_lat: number | null;
  place_lng: number | null;
  radius_meters: number | null;
  active: number;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export async function getDevChallengeById(env: Env, id: string): Promise<DevChallengeRow | null> {
  return env.DB.prepare('SELECT * FROM dev_challenges WHERE id = ? AND active = 1').bind(id).first<DevChallengeRow>();
}

function toClientChallenge(row: DevChallengeRow) {
  return {
    id: row.id,
    cadence: row.cadence,
    cat: row.cat,
    tokens: row.tokens,
    title: row.title,
    desc: row.desc,
    verify: row.verify_type,
    proofType: row.proof_type,
    ...(row.streak_target != null ? { streakTarget: row.streak_target } : {}),
  };
}

function toAdminShape(row: DevChallengeRow) {
  return {
    id: row.id,
    title: row.title,
    desc: row.desc,
    tokens: row.tokens,
    cadence: row.cadence,
    cat: row.cat,
    verify: row.verify_type,
    proofType: row.proof_type,
    streakTarget: row.streak_target,
    placeLat: row.place_lat,
    placeLng: row.place_lng,
    radiusMeters: row.radius_meters,
    active: !!row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Validates and normalizes a create/update body. Returns either the
// normalized fields or a Response describing what's wrong — every field
// here is authoritative once stored (mirrors resolveCatalogEntry's role for
// the static/local catalogs), so nothing malformed gets past this gate.
function parseChallengeBody(body: Record<string, unknown>): {
  title: string;
  desc: string;
  tokens: number;
  cadence: Cadence;
  cat: string;
  verify: VerifyType;
  proofType: ProofType;
  streakTarget: number | null;
  location: LocationFields | null;
} | Response {
  const title = String(body.title ?? '').trim().slice(0, MAX_TITLE_LENGTH);
  const desc = String(body.desc ?? '').trim().slice(0, MAX_DESC_LENGTH);
  const tokens = Number(body.tokens);
  const cadence = String(body.cadence ?? '') as Cadence;
  const cat = String(body.cat ?? '');
  const verify = String(body.verify ?? '') as VerifyType;
  const proofType = String(body.proofType ?? '') as ProofType;
  const streakTargetRaw = body.streakTarget;

  if (!title) return error('Title is required');
  if (!desc) return error('Description is required');
  if (!Number.isInteger(tokens) || tokens <= 0 || tokens > MAX_TOKENS) {
    return error(`Tokens must be a whole number between 1 and ${MAX_TOKENS}`);
  }
  if (!VALID_CADENCES.includes(cadence)) return error(`Cadence must be one of: ${VALID_CADENCES.join(', ')}`);
  if (!VALID_CATS.includes(cat)) return error(`Category must be one of: ${VALID_CATS.join(', ')}`);
  if (!VALID_VERIFY.includes(verify)) return error(`Verify must be one of: ${VALID_VERIFY.join(', ')}`);
  if (!VALID_PROOF.includes(proofType)) return error(`Proof type must be one of: ${VALID_PROOF.join(', ')}`);

  let streakTarget: number | null = null;
  if (verify === 'streak') {
    streakTarget = Number(streakTargetRaw);
    if (!Number.isInteger(streakTarget) || streakTarget <= 0) return error('Streak target is required and must be a positive whole number');
  }

  const location = parseOptionalLocation(body);
  if (location instanceof Response) return location;

  return { title, desc, tokens, cadence, cat, verify, proofType, streakTarget, location };
}

// GET /challenges/custom — every logged-in user needs this to see custom
// challenges in their suggestion pool, same trust level as /local-challenges.
export async function handleListCustomChallenges(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const { results } = await env.DB.prepare('SELECT * FROM dev_challenges WHERE active = 1').all<DevChallengeRow>();
  return json({ challenges: (results ?? []).map(toClientChallenge) });
}

export async function handleAdminListChallenges(request: Request, env: Env): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const { results } = await env.DB.prepare('SELECT * FROM dev_challenges ORDER BY created_at DESC').all<DevChallengeRow>();
  return json({ challenges: (results ?? []).map(toAdminShape) });
}

export async function handleAdminCreateChallenge(request: Request, env: Env): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  const parsed = parseChallengeBody(body);
  if (parsed instanceof Response) return parsed;

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO dev_challenges (id, title, desc, tokens, cadence, cat, verify_type, proof_type, streak_target, place_lat, place_lng, radius_meters, active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
  )
    .bind(
      id,
      parsed.title,
      parsed.desc,
      parsed.tokens,
      parsed.cadence,
      parsed.cat,
      parsed.verify,
      parsed.proofType,
      parsed.streakTarget,
      parsed.location?.placeLat ?? null,
      parsed.location?.placeLng ?? null,
      parsed.location?.radiusMeters ?? null,
      auth.id,
      now,
      now
    )
    .run();

  const row = await env.DB.prepare('SELECT * FROM dev_challenges WHERE id = ?').bind(id).first<DevChallengeRow>();
  return json({ challenge: row ? toAdminShape(row) : null });
}

export async function handleAdminUpdateChallenge(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const existing = await env.DB.prepare('SELECT * FROM dev_challenges WHERE id = ?').bind(id).first<DevChallengeRow>();
  if (!existing) return error('Not found', 404);

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  // A bare {"active": false} toggle doesn't need every other field re-sent.
  if (Object.keys(body).length === 1 && typeof body.active === 'boolean') {
    await env.DB.prepare('UPDATE dev_challenges SET active = ?, updated_at = ? WHERE id = ?')
      .bind(body.active ? 1 : 0, Date.now(), id)
      .run();
  } else {
    const parsed = parseChallengeBody(body);
    if (parsed instanceof Response) return parsed;
    await env.DB.prepare(
      `UPDATE dev_challenges SET title = ?, desc = ?, tokens = ?, cadence = ?, cat = ?, verify_type = ?, proof_type = ?, streak_target = ?, place_lat = ?, place_lng = ?, radius_meters = ?, updated_at = ? WHERE id = ?`
    )
      .bind(
        parsed.title,
        parsed.desc,
        parsed.tokens,
        parsed.cadence,
        parsed.cat,
        parsed.verify,
        parsed.proofType,
        parsed.streakTarget,
        parsed.location?.placeLat ?? null,
        parsed.location?.placeLng ?? null,
        parsed.location?.radiusMeters ?? null,
        Date.now(),
        id
      )
      .run();
  }

  const row = await env.DB.prepare('SELECT * FROM dev_challenges WHERE id = ?').bind(id).first<DevChallengeRow>();
  return json({ challenge: row ? toAdminShape(row) : null });
}

// Soft delete only — see file header. Deactivates rather than removes.
export async function handleAdminDeleteChallenge(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const result = await env.DB.prepare('UPDATE dev_challenges SET active = 0, updated_at = ? WHERE id = ?').bind(Date.now(), id).run();
  if (result.meta.changes === 0) return error('Not found', 404);
  return json({ ok: true });
}
