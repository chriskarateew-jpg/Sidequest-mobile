-- Needed so a completion can be matched back to the specific challenge it
-- was for (quest_title alone isn't a stable/unique key to resolve duels against).
ALTER TABLE posts ADD COLUMN challenge_id TEXT;

-- SQLite can't alter a CHECK constraint in place, so the ledger's allowed
-- "reason" values are extended by rebuilding the table.
CREATE TABLE token_ledger_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'quest_complete', 'shop_purchase', 'pot_stake', 'pot_payout', 'pot_refund',
    'duel_stake', 'duel_payout', 'duel_refund'
  )),
  ref_id TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO token_ledger_new SELECT * FROM token_ledger;
DROP TABLE token_ledger;
ALTER TABLE token_ledger_new RENAME TO token_ledger;
CREATE INDEX idx_token_ledger_user ON token_ledger(user_id);

CREATE TABLE duels (
  id TEXT PRIMARY KEY,
  challenger_id TEXT NOT NULL REFERENCES users(id),
  opponent_id TEXT NOT NULL REFERENCES users(id),
  challenge_id TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly')),
  wager INTEGER NOT NULL CHECK (wager > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'completed', 'expired', 'declined', 'cancelled')) DEFAULT 'pending',
  winner_id TEXT REFERENCES users(id),
  starts_at INTEGER,
  ends_at INTEGER,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE INDEX idx_duels_challenger ON duels(challenger_id);
CREATE INDEX idx_duels_opponent ON duels(opponent_id);
CREATE INDEX idx_posts_challenge ON posts(challenge_id);
