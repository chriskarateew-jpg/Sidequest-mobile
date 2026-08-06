import { requireAuth } from './auth';
import { resolveBaseCatalogEntry } from './catalog';
import type { Env } from './env';
import { error, json, safeJson } from './http';
import { creditTokens, debitTokens, type Cadence } from './tokens';

const CADENCE_WINDOW_MS: Record<Cadence, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

interface DuelRow {
  id: string;
  challenger_id: string;
  opponent_id: string;
  challenge_id: string;
  cadence: Cadence;
  wager: number;
  status: 'pending' | 'active' | 'completed' | 'expired' | 'declined' | 'cancelled';
  winner_id: string | null;
  starts_at: number | null;
  ends_at: number | null;
  created_at: number;
  resolved_at: number | null;
}

async function areFriends(env: Env, userA: string, userB: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM friendships WHERE status = 'accepted'
     AND ((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?))`
  )
    .bind(userA, userB, userB, userA)
    .first();
  return !!row;
}

export async function handleCreateDuel(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const body = await safeJson(request);
  const opponentId = String(body?.opponentId ?? '');
  const challengeId = String(body?.challengeId ?? '');
  const wager = Math.floor(Number(body?.wager));

  if (!opponentId || opponentId === auth.id) return error('Invalid opponent');
  if (!wager || wager <= 0) return error('Wager must be a positive number of tokens');
  // Resolves through the full catalog chain (static, local, dev, timed) —
  // this used to only check the static CHALLENGE_CATALOG directly, which
  // silently made duels uncreatable against any local/dev-authored/timed
  // challenge (see docs/task-database-roadmap.md Phase 3).
  const catalogEntry = await resolveBaseCatalogEntry(env, challengeId);
  if (!catalogEntry) return error('Unknown challenge');
  if (!(await areFriends(env, auth.id, opponentId))) return error('You can only duel friends', 403);

  const id = crypto.randomUUID();
  const now = Date.now();

  const staked = await debitTokens(env, auth.id, wager, 'duel_stake', id);
  if (!staked) return error("You don't have enough tokens for that wager", 402);

  await env.DB.prepare(
    `INSERT INTO duels (id, challenger_id, opponent_id, challenge_id, cadence, wager, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
  )
    .bind(id, auth.id, opponentId, challengeId, catalogEntry.cadence, wager, now)
    .run();

  return json({ duel: { id, challengerId: auth.id, opponentId, challengeId, cadence: catalogEntry.cadence, wager, status: 'pending' } });
}

export async function handleRespondDuel(request: Request, env: Env, duelId: string, accept: boolean): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const duel = await env.DB.prepare('SELECT * FROM duels WHERE id = ?').bind(duelId).first<DuelRow>();
  if (!duel) return error('Duel not found', 404);
  if (duel.opponent_id !== auth.id) return error('Only the invited opponent can respond to this duel', 403);
  if (duel.status !== 'pending') return error('This duel is no longer pending');

  if (!accept) {
    await creditTokens(env, duel.challenger_id, duel.wager, 'duel_refund', duel.id);
    await env.DB.prepare("UPDATE duels SET status = 'declined', resolved_at = ? WHERE id = ?").bind(Date.now(), duel.id).run();
    return json({ ok: true });
  }

  const staked = await debitTokens(env, auth.id, duel.wager, 'duel_stake', duel.id);
  if (!staked) return error("You don't have enough tokens to match that wager", 402);

  const now = Date.now();
  const endsAt = now + CADENCE_WINDOW_MS[duel.cadence];
  await env.DB.prepare("UPDATE duels SET status = 'active', starts_at = ?, ends_at = ? WHERE id = ?")
    .bind(now, endsAt, duel.id)
    .run();

  return json({ ok: true });
}

export async function handleCancelDuel(request: Request, env: Env, duelId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const duel = await env.DB.prepare('SELECT * FROM duels WHERE id = ?').bind(duelId).first<DuelRow>();
  if (!duel) return error('Duel not found', 404);
  if (duel.challenger_id !== auth.id) return error('Only the challenger can cancel this duel', 403);
  if (duel.status !== 'pending') return error('This duel can no longer be cancelled');

  await creditTokens(env, duel.challenger_id, duel.wager, 'duel_refund', duel.id);
  await env.DB.prepare("UPDATE duels SET status = 'cancelled', resolved_at = ? WHERE id = ?").bind(Date.now(), duel.id).run();
  return json({ ok: true });
}

// Called lazily whenever a duel is listed/read past its deadline — refunds
// both sides if nobody won in time. No cron trigger needed.
async function expireDuelIfDue(env: Env, duel: DuelRow): Promise<DuelRow> {
  if (duel.status !== 'active' || !duel.ends_at || Date.now() < duel.ends_at) return duel;

  const claim = await env.DB.prepare("UPDATE duels SET status = 'expired', resolved_at = ? WHERE id = ? AND status = 'active'")
    .bind(Date.now(), duel.id)
    .run();
  if (claim.meta.changes === 0) {
    return (await env.DB.prepare('SELECT * FROM duels WHERE id = ?').bind(duel.id).first<DuelRow>()) ?? duel;
  }

  await creditTokens(env, duel.challenger_id, duel.wager, 'duel_refund', duel.id);
  await creditTokens(env, duel.opponent_id, duel.wager, 'duel_refund', duel.id);

  return (await env.DB.prepare('SELECT * FROM duels WHERE id = ?').bind(duel.id).first<DuelRow>()) ?? duel;
}

// Called from feed.ts right after a quest completion is recorded — checks
// whether that completion just won an active duel for this exact challenge.
// Only counts completions from here on out (after both stakes were locked
// in), so nobody can win a duel with proof they already had lying around.
export async function resolveDuelOnCompletion(env: Env, userId: string, challengeId: string): Promise<number | null> {
  const duel = await env.DB.prepare(
    `SELECT * FROM duels WHERE challenge_id = ? AND status = 'active' AND (challenger_id = ? OR opponent_id = ?)`
  )
    .bind(challengeId, userId, userId)
    .first<DuelRow>();
  if (!duel) return null;

  const claim = await env.DB.prepare("UPDATE duels SET status = 'completed', winner_id = ?, resolved_at = ? WHERE id = ? AND status = 'active'")
    .bind(userId, Date.now(), duel.id)
    .run();
  if (claim.meta.changes === 0) return null; // someone else already claimed it (or it just expired)

  return creditTokens(env, userId, duel.wager * 2, 'duel_payout', duel.id);
}

function duelSummary(duel: DuelRow) {
  return {
    id: duel.id,
    challengerId: duel.challenger_id,
    opponentId: duel.opponent_id,
    challengeId: duel.challenge_id,
    cadence: duel.cadence,
    wager: duel.wager,
    status: duel.status,
    winnerId: duel.winner_id,
    startsAt: duel.starts_at,
    endsAt: duel.ends_at,
  };
}

export async function handleListDuels(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const { results } = await env.DB.prepare(
    `SELECT duels.*, cu.username as challenger_username, ou.username as opponent_username
     FROM duels
     JOIN users cu ON cu.id = duels.challenger_id
     JOIN users ou ON ou.id = duels.opponent_id
     WHERE duels.challenger_id = ? OR duels.opponent_id = ?
     ORDER BY duels.created_at DESC`
  )
    .bind(auth.id, auth.id)
    .all<DuelRow & { challenger_username: string; opponent_username: string }>();

  const duels = [];
  for (const row of results ?? []) {
    const resolved = await expireDuelIfDue(env, row);
    duels.push({
      ...duelSummary(resolved),
      challengerUsername: row.challenger_username,
      opponentUsername: row.opponent_username,
    });
  }

  return json({ duels });
}
