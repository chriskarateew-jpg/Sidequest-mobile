-- Time-boxed developer "Challenges" — distinct from the recurring
-- cadence-based dev_challenges ("Tasks"). Deadline is global and absolute
-- (created_at + duration_minutes), the same instant for every user, not a
-- per-user countdown. "Who already completed it" is answered by the
-- existing completions table (period_key='once' for this kind), so no
-- separate assignment/tracking table is needed.

CREATE TABLE timed_challenges (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  desc TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  cat TEXT NOT NULL,
  proof_type TEXT NOT NULL,          -- 'camera' | 'screenshot' | 'either'
  duration_minutes INTEGER NOT NULL, -- deadline = created_at + duration_minutes*60000
  active INTEGER NOT NULL DEFAULT 1, -- manual kill switch: ends it early, independent of the natural deadline
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
