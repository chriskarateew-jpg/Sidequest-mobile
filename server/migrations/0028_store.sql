-- Gumpa Store: one-time consumable purchases (real money, via RevenueCat's
-- non-renewing-purchase products), a revenue stream deliberately separate
-- from the Gumpa+ subscription. See server/src/store.ts and
-- docs/rewards-economy-plan.md.

-- Active/expired personal token-earning multipliers, scoped to a single
-- user (unlike token_boosts in 0016_dev_admin.sql, which is developer-
-- granted and challenge-wide, applying to every user attempting that
-- challenge). Read by complete.ts at credit time via
-- getActivePersonalBoostMultiplier.
CREATE TABLE user_boosts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  multiplier REAL NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_user_boosts_user ON user_boosts(user_id, ends_at);

-- Full audit trail of every real Store purchase, mirroring
-- subscription_events' append-only pattern (0027_gumpa_plus_subscriptions.sql).
-- item_id is nullable: a webhook could in principle reference a product_id
-- no longer in STORE_CATALOG (a retired item), and the purchase should
-- still be recorded even if there's no effect left to apply.
CREATE TABLE store_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  item_id TEXT,
  revenuecat_event_id TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_store_purchases_user ON store_purchases(user_id);
