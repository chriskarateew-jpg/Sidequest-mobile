-- Links a local_challenges row to the venue_pool venue and period it was
-- materialized for, so the same venue+period always resolves to the same
-- row (the mechanism that lets two nearby users converge on one shared
-- task instead of each getting their own copy). Existing rows keep both
-- columns NULL forever and stay resolvable exactly as before via the
-- unchanged getLocalChallengeById `WHERE id = ?` lookup — nothing
-- downstream (complete.ts, verify.ts, duels.ts, boosts.ts) reads either
-- column, so no backfill is needed or attempted.
ALTER TABLE local_challenges ADD COLUMN venue_id TEXT;
ALTER TABLE local_challenges ADD COLUMN period_key TEXT;

-- Partial index so only rows participating in the new model are
-- constrained — legacy NULL/NULL rows are excluded entirely rather than
-- relying on SQLite's "each NULL is distinct" behavior.
CREATE UNIQUE INDEX idx_local_challenges_venue_period
  ON local_challenges(venue_id, period_key)
  WHERE venue_id IS NOT NULL;
