// Gumpa — RevenueCat webhook handling and Gumpa+ entitlement state. This is
// the only writer of users.has_gumpa_plus / gumpa_plus_period_start/end;
// every other consumer (reward redemption in rewards.ts) reads those
// columns server-side and never trusts a client-supplied flag.
//
// Not yet wired to a real RevenueCat account — the business/billing setup
// this depends on (docs/gumpa-plus-billing-roadmap.md Phases 1-5) isn't
// done. This handler is written against RevenueCat's documented webhook
// event shape and is safe to deploy now: without REVENUECAT_WEBHOOK_SECRET
// set (via `wrangler secret put`), it refuses every request, and even once
// set, nothing calls it until RevenueCat is actually configured to.

import { timingSafeEqual } from './crypto';
import type { Env } from './env';
import { error, json, safeJson } from './http';
import { applyStorePurchase } from './store';

// Shared read of the one column this file writes — used anywhere a request
// needs to re-check Gumpa+ status server-side rather than trust a client
// flag (reward redemption in rewards.ts reads the column directly since it
// also needs the period start/end; this is for the simpler yes/no callers
// like the early-access challenge gate in verify.ts/complete.ts/
// dev-challenges.ts, see docs/gumpa-plus-perks-roadmap.md Phase 4).
export async function userHasGumpaPlus(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT has_gumpa_plus FROM users WHERE id = ?').bind(userId).first<{ has_gumpa_plus: number }>();
  return !!row?.has_gumpa_plus;
}

// Events that grant/confirm entitlement. UNCANCELLATION covers a user
// undoing a pending cancellation before their paid period actually ends —
// they never lost access, this just reconfirms it. PRODUCT_CHANGE covers
// switching between subscription tiers/durations without a gap.
const ENTITLEMENT_GRANTING_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE']);
// CANCELLATION alone does NOT revoke — the subscriber keeps access through
// the period they already paid for (RevenueCat still sends an EXPIRATION
// event once that period genuinely ends, and that's what revokes here).
const ENTITLEMENT_REVOKING_EVENTS = new Set(['EXPIRATION']);

interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id: string;
  product_id?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number;
}

export async function handleRevenueCatWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.REVENUECAT_WEBHOOK_SECRET) return error('Webhook not configured', 503);

  const authHeader = request.headers.get('authorization') ?? '';
  if (!timingSafeEqual(authHeader, `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`)) {
    return error('Not authenticated', 401);
  }

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  const event = (body as { event?: RevenueCatEvent }).event;
  if (!event || typeof event.id !== 'string' || typeof event.type !== 'string' || typeof event.app_user_id !== 'string') {
    return error('Malformed event');
  }

  // app_user_id is whatever the Expo app passes react-native-purchases at
  // login — wired to our own user id, so this is a direct lookup, not a
  // fuzzy match by email/username.
  const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(event.app_user_id).first<{ id: string }>();
  if (!user) return json({ ok: true }); // unknown user id — ack anyway, nothing to apply

  // A one-time Store purchase (server/src/store.ts) isn't a subscription
  // event at all — routed separately, with its own idempotency table
  // (store_purchases), before any of the subscription_events logic below.
  if (event.type === 'NON_RENEWING_PURCHASE') {
    if (!event.product_id) return error('Malformed event');
    const alreadyPurchased = await env.DB.prepare('SELECT id FROM store_purchases WHERE revenuecat_event_id = ?')
      .bind(event.id)
      .first();
    if (alreadyPurchased) return json({ ok: true });

    await applyStorePurchase(env, user.id, event.product_id, event.id, JSON.stringify(body));
    return json({ ok: true });
  }

  // Idempotent on revenuecat_event_id: RevenueCat retries webhook delivery
  // on any non-2xx response, and a duplicate delivery of an already-applied
  // event must be a silent no-op, never a double-grant/revoke.
  const already = await env.DB.prepare('SELECT id FROM subscription_events WHERE revenuecat_event_id = ?')
    .bind(event.id)
    .first();
  if (already) return json({ ok: true });

  const periodStart = event.purchased_at_ms ?? null;
  const periodEnd = event.expiration_at_ms ?? null;

  const statements = [
    env.DB.prepare(
      'INSERT INTO subscription_events (id, user_id, revenuecat_event_id, event_type, product_id, period_start, period_end, raw_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      crypto.randomUUID(),
      user.id,
      event.id,
      event.type,
      event.product_id ?? null,
      periodStart,
      periodEnd,
      JSON.stringify(body),
      Date.now()
    ),
  ];

  if (ENTITLEMENT_GRANTING_EVENTS.has(event.type)) {
    statements.push(
      env.DB.prepare('UPDATE users SET has_gumpa_plus = 1, gumpa_plus_period_start = ?, gumpa_plus_period_end = ? WHERE id = ?').bind(
        periodStart,
        periodEnd,
        user.id
      )
    );
  } else if (ENTITLEMENT_REVOKING_EVENTS.has(event.type)) {
    statements.push(env.DB.prepare('UPDATE users SET has_gumpa_plus = 0 WHERE id = ?').bind(user.id));
  }

  await env.DB.batch(statements);
  return json({ ok: true });
}
