-- Developer-only custom challenges and temporary token-payout boosts.
-- Both are soft-deleted (active=0 / cancelled_at set), never hard-deleted —
-- an id already handed to a client, or referenced by a past completions/posts
-- row, must stay resolvable via resolveCatalogEntry (see server/src/catalog.ts),
-- same immutability rule already used for local_challenges.

CREATE TABLE dev_challenges (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  desc TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  cadence TEXT NOT NULL,       -- 'daily' | 'weekly' | 'monthly'
  cat TEXT NOT NULL,           -- CategoryId (client display/grouping only)
  verify_type TEXT NOT NULL,   -- 'photo' | 'streak'
  proof_type TEXT NOT NULL,    -- 'camera' | 'screenshot' | 'either'
  streak_target INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE token_boosts (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  boosted_tokens INTEGER NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  cancelled_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_token_boosts_challenge ON token_boosts (challenge_id, ends_at);
