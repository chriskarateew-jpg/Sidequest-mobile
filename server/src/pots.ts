import { requireAuth } from './auth';
import type { Env } from './env';
import { error, json, safeJson } from './http';
import { creditTokens, debitTokens } from './tokens';

const MIN_DURATION_DAYS = 3;
const MAX_DURATION_DAYS = 30;

interface PotRow {
  id: string;
  group_id: string;
  created_by: string;
  buy_in: number;
  threshold_count: number;
  split_method: 'even' | 'weighted';
  starts_at: number;
  ends_at: number;
  status: 'open' | 'resolved';
  created_at: number;
  resolved_at: number | null;
}

async function requireGroupMember(env: Env, groupId: string, userId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?')
    .bind(groupId, userId)
    .first();
  return !!row;
}

export async function handleCreatePot(request: Request, env: Env, groupId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);
  if (!(await requireGroupMember(env, groupId, auth.id))) return error('Not a member of this group', 403);

  const body = await safeJson(request);
  const buyIn = Math.floor(Number(body?.buyIn));
  const thresholdCount = Math.floor(Number(body?.thresholdCount));
  const splitMethod = body?.splitMethod === 'weighted' ? 'weighted' : 'even';
  const durationDays = Math.floor(Number(body?.durationDays));

  if (!buyIn || buyIn <= 0) return error('Buy-in must be a positive number of tokens');
  if (!thresholdCount || thresholdCount <= 0) return error('Threshold must be a positive number of posts');
  if (!durationDays || durationDays < MIN_DURATION_DAYS || durationDays > MAX_DURATION_DAYS) {
    return error(`Duration must be between ${MIN_DURATION_DAYS} and ${MAX_DURATION_DAYS} days`);
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const endsAt = now + durationDays * 24 * 60 * 60 * 1000;

  const staked = await debitTokens(env, auth.id, buyIn, 'pot_stake', id);
  if (!staked) return error("You don't have enough tokens for that buy-in", 402);

  await env.DB.prepare(
    `INSERT INTO pots (id, group_id, created_by, buy_in, threshold_count, split_method, starts_at, ends_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
  )
    .bind(id, groupId, auth.id, buyIn, thresholdCount, splitMethod, now, endsAt, now)
    .run();

  await env.DB.prepare('INSERT INTO pot_entries (id, pot_id, user_id, joined_at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), id, auth.id, now)
    .run();

  return json({ pot: { id, groupId, buyIn, thresholdCount, splitMethod, startsAt: now, endsAt, status: 'open' } });
}

export async function handleJoinPot(request: Request, env: Env, potId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const pot = await env.DB.prepare('SELECT * FROM pots WHERE id = ?').bind(potId).first<PotRow>();
  if (!pot) return error('Pot not found', 404);
  if (!(await requireGroupMember(env, pot.group_id, auth.id))) return error('Not a member of this group', 403);
  if (pot.status !== 'open' || Date.now() >= pot.ends_at) return error('This pot is no longer open to join');

  const existing = await env.DB.prepare('SELECT id FROM pot_entries WHERE pot_id = ? AND user_id = ?')
    .bind(potId, auth.id)
    .first();
  if (existing) return error("You're already in this pot", 409);

  const staked = await debitTokens(env, auth.id, pot.buy_in, 'pot_stake', potId);
  if (!staked) return error("You don't have enough tokens for that buy-in", 402);

  await env.DB.prepare('INSERT INTO pot_entries (id, pot_id, user_id, joined_at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), potId, auth.id, Date.now())
    .run();

  return json({ ok: true });
}

// D1 has no cron trigger wired up here, so pots resolve lazily: whenever
// anyone reads a pot past its end time, this runs the payout once. The
// status flip is a single conditional UPDATE so two concurrent reads can't
// both pay it out.
async function resolvePotIfDue(env: Env, pot: PotRow): Promise<PotRow> {
  if (pot.status === 'resolved' || Date.now() < pot.ends_at) return pot;

  const claim = await env.DB.prepare("UPDATE pots SET status = 'resolved', resolved_at = ? WHERE id = ? AND status = 'open'")
    .bind(Date.now(), pot.id)
    .run();
  if (claim.meta.changes === 0) {
    return (await env.DB.prepare('SELECT * FROM pots WHERE id = ?').bind(pot.id).first<PotRow>()) ?? pot;
  }

  const { results: entries } = await env.DB.prepare('SELECT id, user_id FROM pot_entries WHERE pot_id = ?')
    .bind(pot.id)
    .all<{ id: string; user_id: string }>();

  const counts: Record<string, number> = {};
  for (const e of entries ?? []) {
    const row = await env.DB.prepare('SELECT COUNT(*) as c FROM posts WHERE user_id = ? AND created_at >= ? AND created_at < ?')
      .bind(e.user_id, pot.starts_at, pot.ends_at)
      .first<{ c: number }>();
    counts[e.user_id] = row?.c ?? 0;
  }

  const qualifiers = (entries ?? []).filter((e) => counts[e.user_id] >= pot.threshold_count);
  const nonQualifiers = (entries ?? []).filter((e) => counts[e.user_id] < pot.threshold_count);
  const forfeited = nonQualifiers.length * pot.buy_in;

  if (qualifiers.length === 0) {
    // nobody hit the bar — everybody just gets their own stake back
    for (const e of entries ?? []) {
      await creditTokens(env, e.user_id, pot.buy_in, 'pot_refund', pot.id);
      await env.DB.prepare('UPDATE pot_entries SET qualified = 0, payout = ? WHERE id = ?').bind(pot.buy_in, e.id).run();
    }
  } else {
    const totalQualifyingPosts = qualifiers.reduce((sum, e) => sum + counts[e.user_id], 0);
    for (const e of qualifiers) {
      const share =
        pot.split_method === 'even'
          ? Math.floor(forfeited / qualifiers.length)
          : Math.floor((forfeited * counts[e.user_id]) / totalQualifyingPosts);
      const payout = pot.buy_in + share;
      await creditTokens(env, e.user_id, payout, 'pot_payout', pot.id);
      await env.DB.prepare('UPDATE pot_entries SET qualified = 1, payout = ? WHERE id = ?').bind(payout, e.id).run();
    }
    for (const e of nonQualifiers) {
      await env.DB.prepare('UPDATE pot_entries SET qualified = 0, payout = 0 WHERE id = ?').bind(e.id).run();
    }
  }

  return (await env.DB.prepare('SELECT * FROM pots WHERE id = ?').bind(pot.id).first<PotRow>()) ?? pot;
}

function potSummary(pot: PotRow) {
  return {
    id: pot.id,
    groupId: pot.group_id,
    createdBy: pot.created_by,
    buyIn: pot.buy_in,
    thresholdCount: pot.threshold_count,
    splitMethod: pot.split_method,
    startsAt: pot.starts_at,
    endsAt: pot.ends_at,
    status: pot.status,
  };
}

export async function handleListGroupPots(request: Request, env: Env, groupId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);
  if (!(await requireGroupMember(env, groupId, auth.id))) return error('Not a member of this group', 403);

  const { results } = await env.DB.prepare('SELECT * FROM pots WHERE group_id = ? ORDER BY created_at DESC')
    .bind(groupId)
    .all<PotRow>();

  const pots = [];
  for (const row of results ?? []) {
    const resolved = await resolvePotIfDue(env, row);
    const entryCount = await env.DB.prepare('SELECT COUNT(*) as c FROM pot_entries WHERE pot_id = ?')
      .bind(resolved.id)
      .first<{ c: number }>();
    const myEntry = await env.DB.prepare('SELECT id FROM pot_entries WHERE pot_id = ? AND user_id = ?')
      .bind(resolved.id, auth.id)
      .first();
    const count = entryCount?.c ?? 0;
    pots.push({ ...potSummary(resolved), entryCount: count, totalTokens: count * resolved.buy_in, joined: !!myEntry });
  }

  return json({ pots });
}

export async function handleGetPot(request: Request, env: Env, potId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  let pot = await env.DB.prepare('SELECT * FROM pots WHERE id = ?').bind(potId).first<PotRow>();
  if (!pot) return error('Pot not found', 404);
  if (!(await requireGroupMember(env, pot.group_id, auth.id))) return error('Not a member of this group', 403);

  pot = await resolvePotIfDue(env, pot);

  const { results: entries } = await env.DB.prepare(
    `SELECT pot_entries.user_id, users.username, pot_entries.qualified, pot_entries.payout,
        (SELECT COUNT(*) FROM posts WHERE posts.user_id = pot_entries.user_id AND posts.created_at >= ? AND posts.created_at < ?) as post_count
     FROM pot_entries
     JOIN users ON users.id = pot_entries.user_id
     WHERE pot_entries.pot_id = ?
     ORDER BY post_count DESC`
  )
    .bind(pot.starts_at, Math.min(pot.ends_at, Date.now()), potId)
    .all<{ user_id: string; username: string; qualified: number | null; payout: number | null; post_count: number }>();

  return json({
    pot: {
      ...potSummary(pot),
      entries: (entries ?? []).map((e) => ({
        userId: e.user_id,
        username: e.username,
        postCount: e.post_count,
        qualified: e.qualified === null ? null : !!e.qualified,
        payout: e.payout,
      })),
    },
  });
}
