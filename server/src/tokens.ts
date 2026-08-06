import { requireAuth } from './auth';
import type { Env } from './env';
import { error, json } from './http';

// Server-side mirror of the client's static catalog (src/lib/data.ts).
// Token amounts, cadence, verify method/target, and post title/desc are all
// authoritative here and never trusted from the client — every earn/spend/
// duel/completion is validated against this map so nothing can be forged
// client-side. Keep in sync with src/lib/data.ts if that catalog changes.
export type Cadence = 'daily' | 'weekly' | 'monthly';
export type VerifyType = 'photo' | 'streak';
// Mirrors src/lib/data.ts's ProofType — see that file for what each value
// means and why. Authoritative here; the client's declared proofType is
// never trusted for gating (e.g. the GPS-mismatch check in complete.ts).
export type ProofType = 'camera' | 'screenshot' | 'either';

export interface CatalogEntry {
  cadence: Cadence;
  tokens: number;
  verify: VerifyType;
  proofType: ProofType;
  target?: number; // instances required within the period; only set when verify === 'streak'
  title: string;
  desc: string;
  placeLat?: number; // set for server-generated local/venue challenges, or a developer-pinned location (see location-fields.ts)
  placeLng?: number;
  placeName?: string;
  // Per-entry GPS-proximity radius in meters, checked in complete.ts's
  // checkPhotoFraud. Only ever set alongside placeLat/placeLng. Falls back
  // to LOCAL_DISTANCE_THRESHOLD_METERS there when unset (the fixed radius
  // local_challenges has always used) — a developer-authored entry can
  // override it with its own configured radius instead.
  radiusMeters?: number;
  // Set only for a time-boxed developer Challenge (see timed-challenges.ts) —
  // distinct from a recurring cadence-based Task. complete.ts/verify.ts
  // branch on this to enforce the global deadline and use a fixed 'once'
  // period key instead of the usual daily/weekly/monthly one.
  kind?: 'timed';
  deadlineAt?: number; // only set when kind === 'timed'
  // Optional per-task verification guidance for a developer-authored entry
  // (see dev-challenges.ts) — short phrases spliced into verify.ts's prompt
  // template, never a standalone prompt. Never set for a static/local entry.
  proofAccept?: string;
  proofReject?: string;
}

// Formerly held the 40 static tasks that now live in dev_challenges (see
// server/migrations/0020_migrate_static_challenges.sql and
// docs/task-database-roadmap.md Phase 3) — resolveBaseCatalogEntry in
// catalog.ts already falls through to a dev_challenges lookup when this
// misses, so an empty object here is correct, not a placeholder pending
// more work. Kept (rather than removed entirely) as the designated spot for
// a genuinely static, code-only entry if one is ever needed again, and
// because CatalogEntry/Cadence/VerifyType/ProofType above are still used
// throughout server/src regardless of whether this map has any entries.
//
// DEPLOY ORDERING: do not ship this empty map to production until
// 0020_migrate_static_challenges.sql has been applied to the *remote* D1
// database (`wrangler d1 execute sidequest-db --remote`) — it was only
// applied locally as of this change. Deploying before that would 404 every
// one of these 40 challenge ids in production.
export const CHALLENGE_CATALOG: Record<string, CatalogEntry> = {};

// 'shop_purchase' is kept here even though the shop is gone — old
// token_ledger rows still carry it and this type must stay able to describe them.
export type LedgerReason =
  | 'quest_complete'
  | 'shop_purchase'
  | 'pot_stake'
  | 'pot_payout'
  | 'pot_refund'
  | 'duel_stake'
  | 'duel_payout'
  | 'duel_refund';

// Credits always succeed. Returns the new balance.
export async function creditTokens(env: Env, userId: string, amount: number, reason: LedgerReason, refId?: string): Promise<number> {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO token_ledger (id, user_id, amount, reason, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), userId, amount, reason, refId ?? null, Date.now()),
    env.DB.prepare('UPDATE users SET tokens = tokens + ? WHERE id = ?').bind(amount, userId),
  ]);
  const row = await env.DB.prepare('SELECT tokens FROM users WHERE id = ?').bind(userId).first<{ tokens: number }>();
  return row?.tokens ?? 0;
}

// Debits are conditional on having enough balance — the UPDATE itself enforces
// that atomically (no separate read-then-write race), returning false if it
// didn't have enough to cover the debit.
export async function debitTokens(env: Env, userId: string, amount: number, reason: LedgerReason, refId?: string): Promise<boolean> {
  const result = await env.DB.prepare('UPDATE users SET tokens = tokens - ? WHERE id = ? AND tokens >= ?')
    .bind(amount, userId, amount)
    .run();
  if (result.meta.changes === 0) return false;

  await env.DB.prepare('INSERT INTO token_ledger (id, user_id, amount, reason, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, -amount, reason, refId ?? null, Date.now())
    .run();
  return true;
}

export async function getTokenBalance(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT tokens FROM users WHERE id = ?').bind(userId).first<{ tokens: number }>();
  return row?.tokens ?? 0;
}

export async function handleGetBalance(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const tokens = await getTokenBalance(env, auth.id);
  return json({ tokens });
}
