// Gumpa — records interest taps from the Rewards tab, and (now that Gumpa+
// gating exists — see subscriptions.ts) handles actual token-for-reward
// redemption once a user subscribes.

import { requireAuth } from './auth';
import type { Env } from './env';
import { error, json, safeJson } from './http';
import { checkRateLimit } from './ratelimit';
import { debitTokens, getTokenBalance } from './tokens';

const KNOWN_BRAND_IDS = new Set(['starbucks', 'chipotle', 'cava']);

// Server-trusted mirror of src/lib/rewards-data.ts's REWARD_BRANDS tiers —
// never trust a client-supplied amountUsd, same posture as
// tokens.ts's CHALLENGE_CATALOG. Keep in sync if the client catalog changes.
const REWARD_TIERS_USD: Record<string, number[]> = {
  starbucks: [5, 10, 25],
  chipotle: [5, 10, 25],
  cava: [5, 10, 25],
};

// Mirrors src/lib/rewards-data.ts's COINS_PER_DOLLAR — same provisional
// number, same caveat: not final, has to move together with the
// subscription price and the cap below.
const COINS_PER_DOLLAR = 100;

// Hard ceiling on real-dollar redemption value per Gumpa+ billing cycle,
// applied regardless of token balance — this cap, not the coin economy, is
// what actually protects margin (see docs/rewards-economy-plan.md for the
// math: an engaged user's uncapped earn rate can otherwise exceed a
// plausible subscription price on its own). Start conservative — raising
// this later is easy, lowering it on subscribers already used to a higher
// number is not.
const REDEMPTION_CAP_USD_PER_CYCLE = 5;

// A subscriber must have held Gumpa+ for at least this long before their
// first redemption in the current period — a cheap deterrent against
// subscribing for one cycle purely to drain a token balance built up for
// free, then cancelling.
const MIN_SUBSCRIPTION_AGE_MS = 48 * 60 * 60 * 1000;

interface RedeemableUserRow {
  has_gumpa_plus: number;
  gumpa_plus_period_start: number | null;
  gumpa_plus_period_end: number | null;
}

export async function handleRewardsInterest(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  if (!(await checkRateLimit(env, `rewards-interest:${auth.id}`, 30, 3600))) {
    return error('Too many requests. Try again later.', 429);
  }

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  const brandId = typeof body.brandId === 'string' ? body.brandId : '';
  const amountUsd = typeof body.amountUsd === 'number' ? Math.trunc(body.amountUsd) : NaN;
  if (!KNOWN_BRAND_IDS.has(brandId)) return error('Unknown brand');
  if (!Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > 1000) return error('Invalid amount');

  await env.DB.prepare('INSERT INTO rewards_interest (id, user_id, brand_id, amount_usd, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), auth.id, brandId, amountUsd, Date.now())
    .run();

  return json({ ok: true });
}

// Redeems tokens for a real gift-card reward. Gated on has_gumpa_plus read
// fresh from the DB (never a cached client flag — see rewards.tsx's own
// comment on why HAS_GUMPA_PLUS is currently hardcoded false), and on the
// REDEMPTION_CAP_USD_PER_CYCLE ceiling above, which is checked independently
// of token balance — a user can have plenty of coins and still be capped.
export async function handleRedeemReward(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  if (!(await checkRateLimit(env, `reward-redeem:${auth.id}`, 10, 3600))) {
    return error('Too many requests. Try again later.', 429);
  }

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  const brandId = typeof body.brandId === 'string' ? body.brandId : '';
  const amountUsd = typeof body.amountUsd === 'number' ? Math.trunc(body.amountUsd) : NaN;
  const validTiers = REWARD_TIERS_USD[brandId];
  if (!validTiers || !validTiers.includes(amountUsd)) return error('Unknown brand or tier');

  const user = await env.DB.prepare(
    'SELECT has_gumpa_plus, gumpa_plus_period_start, gumpa_plus_period_end FROM users WHERE id = ?'
  )
    .bind(auth.id)
    .first<RedeemableUserRow>();
  if (!user) return error('User not found', 404);

  const now = Date.now();
  if (!user.has_gumpa_plus || !user.gumpa_plus_period_end || user.gumpa_plus_period_end < now) {
    return error('Gumpa+ is required to redeem rewards', 403);
  }
  if (!user.gumpa_plus_period_start || now - user.gumpa_plus_period_start < MIN_SUBSCRIPTION_AGE_MS) {
    return error('Give your subscription a couple of days before redeeming', 403);
  }

  const redeemedRow = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount_usd), 0) as total FROM reward_redemptions WHERE user_id = ? AND created_at >= ? AND status != 'failed'"
  )
    .bind(auth.id, user.gumpa_plus_period_start)
    .first<{ total: number }>();
  const redeemedThisCycle = redeemedRow?.total ?? 0;
  if (redeemedThisCycle + amountUsd > REDEMPTION_CAP_USD_PER_CYCLE) {
    return error(
      `Redemption cap for this billing cycle is $${REDEMPTION_CAP_USD_PER_CYCLE}. You've already used $${redeemedThisCycle}.`,
      403
    );
  }

  const tokenCost = amountUsd * COINS_PER_DOLLAR;
  const debited = await debitTokens(env, auth.id, tokenCost, 'reward_redeem', brandId);
  if (!debited) return error('Not enough coins', 402);

  const redemptionId = crypto.randomUUID();
  // Actual gift-card issuance (a Tremendous/Tango Card API call) isn't wired
  // up yet — that needs a funded fulfillment-provider account, which needs
  // the business bank account (docs/gumpa-plus-billing-roadmap.md Phase 2)
  // first. Recorded as 'pending' so nothing is lost; fulfilling it today is
  // a manual step (buy the card directly, then mark this row 'fulfilled').
  // Wire the real API call here once a provider account exists.
  await env.DB.prepare(
    'INSERT INTO reward_redemptions (id, user_id, brand_id, amount_usd, token_cost, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(redemptionId, auth.id, brandId, amountUsd, tokenCost, 'pending', now)
    .run();

  const balance = await getTokenBalance(env, auth.id);
  return json({
    ok: true,
    redemptionId,
    balance,
    redeemedThisCycle: redeemedThisCycle + amountUsd,
    capUsd: REDEMPTION_CAP_USD_PER_CYCLE,
  });
}
