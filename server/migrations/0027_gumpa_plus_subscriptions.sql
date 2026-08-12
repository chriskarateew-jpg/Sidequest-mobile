-- Gumpa+ subscription state and the reward-redemption ledger. See
-- docs/gumpa-plus-billing-roadmap.md Phase 6 and docs/rewards-economy-plan.md.
--
-- has_gumpa_plus is the single flag every gate in the app trusts (rewards
-- redemption today, possibly other perks later) - it is written only by the
-- RevenueCat webhook handler (server/src/subscriptions.ts), never by the
-- client. gumpa_plus_period_start/end mirror the *current* entitlement
-- period RevenueCat reports on each event, so redemption caps can be scoped
-- to "this billing cycle" without assuming a calendar month.
ALTER TABLE users ADD COLUMN has_gumpa_plus INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN gumpa_plus_period_start INTEGER;
ALTER TABLE users ADD COLUMN gumpa_plus_period_end INTEGER;

-- Full audit trail of every RevenueCat webhook event received, mirroring
-- token_ledger's append-only pattern (0005_token_ledger_and_pots.sql).
-- revenuecat_event_id gives idempotency: RevenueCat retries webhook
-- deliveries on a non-2xx response, and the same event must never be
-- double-applied.
CREATE TABLE subscription_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  revenuecat_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  product_id TEXT,
  period_start INTEGER,
  period_end INTEGER,
  raw_payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_subscription_events_user ON subscription_events(user_id);

-- One row per real-money reward redemption. Separate from token_ledger
-- (which still gets a matching debit row via the new 'reward_redeem'
-- reason) because this table is the one that has to answer "how much real
-- dollar value has this user redeemed this billing cycle" - the per-cycle
-- cap check in server/src/rewards.ts sums amount_usd here, scoped by
-- gumpa_plus_period_start, deliberately never by token balance alone (see
-- docs/rewards-economy-plan.md for why the cap has to be dollar-based, not
-- token-based).
CREATE TABLE reward_redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  brand_id TEXT NOT NULL,
  amount_usd INTEGER NOT NULL,
  token_cost INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'fulfilled', 'failed')) DEFAULT 'pending',
  fulfillment_ref TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_reward_redemptions_user ON reward_redemptions(user_id, created_at);

-- SQLite can't alter a CHECK constraint in place, so - same rebuild pattern
-- 0006_duels.sql already used to add the duel_* reasons - token_ledger is
-- rebuilt to also allow 'reward_redeem'.
CREATE TABLE token_ledger_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'quest_complete', 'shop_purchase', 'pot_stake', 'pot_payout', 'pot_refund',
    'duel_stake', 'duel_payout', 'duel_refund', 'reward_redeem'
  )),
  ref_id TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO token_ledger_new SELECT * FROM token_ledger;
DROP TABLE token_ledger;
ALTER TABLE token_ledger_new RENAME TO token_ledger;
CREATE INDEX idx_token_ledger_user ON token_ledger(user_id);
