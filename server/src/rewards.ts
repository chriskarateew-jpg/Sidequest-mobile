// Gumpa — records interest taps from the (currently preview-only) Rewards
// tab. Nothing here spends tokens or grants anything; it exists purely to
// give real demand data (which brand/tier people actually want) for the
// Gumpa+ subscription and catalog pricing work, before any of that ships.

import { requireAuth } from './auth';
import type { Env } from './env';
import { error, json, safeJson } from './http';
import { checkRateLimit } from './ratelimit';

const KNOWN_BRAND_IDS = new Set(['starbucks', 'chipotle', 'cava']);

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
