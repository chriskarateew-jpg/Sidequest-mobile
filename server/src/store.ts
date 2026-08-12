// Gumpa — the Store: one-time consumable purchases, paid for with real
// money via RevenueCat's non-renewing-purchase products. Deliberately
// separate from the Gumpa+ subscription (server/src/subscriptions.ts) —
// there's no entitlement gate here, anyone can buy a Store item regardless
// of subscription status. See docs/rewards-economy-plan.md for why this
// exists as its own revenue stream.
//
// Not yet wired to real payments, same posture as subscriptions.ts: these
// map to RevenueCat products that need the same App Store Connect / Play
// Console setup Gumpa+ itself is waiting on. The purchase-application logic
// below is real and tested against local D1; it just has nothing to reach
// until that infrastructure exists.

import { requireAuth } from './auth';
import type { Env } from './env';
import { error, json } from './http';

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  // The RevenueCat product id this maps to once real IAP exists — what
  // arrives as event.product_id on a NON_RENEWING_PURCHASE webhook.
  productId: string;
  effect: 'personal_token_boost';
  multiplier: number;
  durationMs: number;
}

// Ships with exactly one item on purpose. A "streak freeze" consumable was
// considered and deferred, not forgotten — spending one requires the
// client-side streak logic in src/lib/store.ts to know how to consume it,
// which doesn't exist until Phase 6 (streak protection) of
// docs/gumpa-plus-perks-roadmap.md ships. Selling an item with no way to
// use it yet would be a half-built feature; add it here once that phase is
// done, not before.
export const STORE_CATALOG: StoreItem[] = [
  {
    id: 'boost_2x_24h',
    name: '24-Hour Double Tokens',
    description: 'Every quest you complete in the next 24 hours earns double tokens.',
    productId: 'gumpa_store_boost_2x_24h',
    effect: 'personal_token_boost',
    multiplier: 2,
    durationMs: 24 * 60 * 60 * 1000,
  },
];

const CATALOG_BY_PRODUCT_ID = new Map(STORE_CATALOG.map((item) => [item.productId, item]));

export async function handleListStoreCatalog(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  return json({ items: STORE_CATALOG.map(({ id, name, description }) => ({ id, name, description })) });
}

// Called from subscriptions.ts's webhook handler for a NON_RENEWING_PURCHASE
// event — applies the purchased item's effect and records the purchase.
// Idempotency (checking revenuecat_event_id hasn't been applied already) is
// the caller's responsibility, same split as the entitlement-granting path.
export async function applyStorePurchase(
  env: Env,
  userId: string,
  productId: string,
  revenuecatEventId: string,
  rawPayload: string
): Promise<void> {
  const item = CATALOG_BY_PRODUCT_ID.get(productId);
  const now = Date.now();

  const statements = [
    env.DB.prepare(
      'INSERT INTO store_purchases (id, user_id, item_id, revenuecat_event_id, product_id, raw_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), userId, item?.id ?? null, revenuecatEventId, productId, rawPayload, now),
  ];

  if (item?.effect === 'personal_token_boost') {
    statements.push(
      env.DB.prepare(
        'INSERT INTO user_boosts (id, user_id, multiplier, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), userId, item.multiplier, now, now + item.durationMs, now)
    );
  }

  await env.DB.batch(statements);
}

// Gumpa+ subscribers earn tokens faster automatically, for as long as
// they're subscribed — a standing personal multiplier, not a one-time
// purchase (docs/gumpa-plus-perks-roadmap.md Phase 5). Near-zero marginal
// cost to the business: tokens only become a real dollar liability at the
// capped redemption step in rewards.ts, never at the earning step, which is
// exactly why this is one of the bundle perks the subscription sells
// instead of leaning on redemption alone — see docs/rewards-economy-plan.md
// for why that matters. A starting value, not locked in; changing it doesn't
// touch the redemption cap math at all.
const GUMPA_PLUS_EARN_MULTIPLIER = 1.5;

// Read by complete.ts at credit time — the strongest currently-active
// personal multiplier for this user: the better of any active purchased
// Store boost or a standing Gumpa+ multiplier, never both stacked (buying a
// boost while already subscribed shouldn't compound into a bigger number
// than either alone). Doesn't reuse subscriptions.ts's userHasGumpaPlus
// helper here on purpose — that file imports from this one
// (applyStorePurchase), so importing back would create a cycle; a plain
// inline query is one extra line, a cycle is a real footgun.
export async function getActivePersonalBoostMultiplier(env: Env, userId: string): Promise<number> {
  const now = Date.now();
  const [boostRow, userRow] = await Promise.all([
    env.DB.prepare('SELECT MAX(multiplier) as m FROM user_boosts WHERE user_id = ? AND starts_at <= ? AND ends_at > ?')
      .bind(userId, now, now)
      .first<{ m: number | null }>(),
    env.DB.prepare('SELECT has_gumpa_plus FROM users WHERE id = ?').bind(userId).first<{ has_gumpa_plus: number }>(),
  ]);

  const purchasedMultiplier = boostRow?.m ?? 1;
  const subscriptionMultiplier = userRow?.has_gumpa_plus ? GUMPA_PLUS_EARN_MULTIPLIER : 1;
  return Math.max(purchasedMultiplier, subscriptionMultiplier);
}
