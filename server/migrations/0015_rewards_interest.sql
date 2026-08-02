-- Logs a tap on a locked reward tier (Rewards tab, pre-subscription) as a
-- demand signal for the Gumpa+ pricing/catalog work. No tokens or money
-- move here, this is market-research data only.
CREATE TABLE rewards_interest (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  brand_id TEXT NOT NULL,
  amount_usd INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_rewards_interest_brand ON rewards_interest(brand_id);
CREATE INDEX idx_rewards_interest_user ON rewards_interest(user_id);
