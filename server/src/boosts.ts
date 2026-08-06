// Gumpa — developer-only temporary token-payout boosts. A boost overrides a
// challenge's token payout for a time window, applied transparently by
// resolveCatalogEntry (catalog.ts) to every consumer: /verify, /complete's
// crediting, and the denormalized posts.tokens_earned. Rows are never
// deleted — cancelling early just sets cancelled_at, so history stays
// intact for the admin list view.

import { requireAuth, requireDeveloper } from './auth';
import { resolveBaseCatalogEntry } from './catalog';
import type { Env } from './env';
import { error, json, safeJson } from './http';

const MAX_TOKENS = 100_000;
const MAX_DURATION_HOURS = 24 * 365; // a year — generous but bounded, not truly infinite

export interface TokenBoostRow {
  id: string;
  challenge_id: string;
  boosted_tokens: number;
  starts_at: number;
  ends_at: number;
  cancelled_at: number | null;
  created_by: string;
  created_at: number;
}

// Latest-created active boost wins if more than one somehow overlaps.
export async function getActiveBoost(env: Env, challengeId: string): Promise<TokenBoostRow | null> {
  const now = Date.now();
  return env.DB.prepare(
    `SELECT * FROM token_boosts
     WHERE challenge_id = ? AND cancelled_at IS NULL AND starts_at <= ? AND ends_at > ?
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(challengeId, now, now)
    .first<TokenBoostRow>();
}

// GET /boosts/active — every logged-in user needs this so any card (static,
// local, or custom) can render the boosted amount, not just ones the client
// happens to fetch individually.
export async function handleListActiveBoosts(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT challenge_id, boosted_tokens, ends_at FROM token_boosts
     WHERE cancelled_at IS NULL AND starts_at <= ? AND ends_at > ?`
  )
    .bind(now, now)
    .all<{ challenge_id: string; boosted_tokens: number; ends_at: number }>();

  return json({
    boosts: (results ?? []).map((r) => ({ challengeId: r.challenge_id, tokens: r.boosted_tokens, endsAt: r.ends_at })),
  });
}

function toAdminShape(row: TokenBoostRow, title: string | null) {
  return {
    id: row.id,
    challengeId: row.challenge_id,
    challengeTitle: title,
    boostedTokens: row.boosted_tokens,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
  };
}

export async function handleAdminListBoosts(request: Request, env: Env): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const { results } = await env.DB.prepare('SELECT * FROM token_boosts ORDER BY created_at DESC').all<TokenBoostRow>();
  const rows = results ?? [];
  const shaped = await Promise.all(
    rows.map(async (row) => {
      const entry = await resolveBaseCatalogEntry(env, row.challenge_id);
      return toAdminShape(row, entry?.title ?? null);
    })
  );
  return json({ boosts: shaped });
}

export async function handleAdminCreateBoost(request: Request, env: Env): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  const challengeId = String(body.challengeId ?? '');
  const boostedTokens = Number(body.boostedTokens);
  const durationHours = Number(body.durationHours);

  if (!challengeId) return error('challengeId is required');
  if (!Number.isInteger(boostedTokens) || boostedTokens <= 0 || boostedTokens > MAX_TOKENS) {
    return error(`Boosted tokens must be a whole number between 1 and ${MAX_TOKENS}`);
  }
  if (!Number.isFinite(durationHours) || durationHours <= 0 || durationHours > MAX_DURATION_HOURS) {
    return error(`Duration must be between 0 and ${MAX_DURATION_HOURS} hours`);
  }

  const baseEntry = await resolveBaseCatalogEntry(env, challengeId);
  if (!baseEntry) return error('Unknown challenge id — it must already exist before it can be boosted');

  const id = crypto.randomUUID();
  const now = Date.now();
  const endsAt = now + durationHours * 60 * 60 * 1000;
  await env.DB.prepare(
    `INSERT INTO token_boosts (id, challenge_id, boosted_tokens, starts_at, ends_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, challengeId, boostedTokens, now, endsAt, auth.id, now)
    .run();

  return json({ boost: { id, challengeId, boostedTokens, startsAt: now, endsAt, cancelledAt: null, createdAt: now } });
}

export async function handleAdminCancelBoost(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireDeveloper(request, env);
  if (!auth) return error('Not found', 404);

  const result = await env.DB.prepare('UPDATE token_boosts SET cancelled_at = ? WHERE id = ? AND cancelled_at IS NULL')
    .bind(Date.now(), id)
    .run();
  if (result.meta.changes === 0) return error('Not found', 404);
  return json({ ok: true });
}
