ALTER TABLE users ADD COLUMN tokens INTEGER NOT NULL DEFAULT 0;

-- Every server-side balance change, ever. amount is signed (credit positive,
-- debit negative) so the ledger is a full audit trail, not just a counter.
CREATE TABLE token_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('quest_complete', 'shop_purchase', 'pot_stake', 'pot_payout', 'pot_refund')),
  ref_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE pots (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  buy_in INTEGER NOT NULL CHECK (buy_in > 0),
  threshold_count INTEGER NOT NULL CHECK (threshold_count > 0),
  split_method TEXT NOT NULL CHECK (split_method IN ('even', 'weighted')),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')) DEFAULT 'open',
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE TABLE pot_entries (
  id TEXT PRIMARY KEY,
  pot_id TEXT NOT NULL REFERENCES pots(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  joined_at INTEGER NOT NULL,
  qualified INTEGER,
  payout INTEGER,
  UNIQUE (pot_id, user_id)
);

CREATE INDEX idx_token_ledger_user ON token_ledger(user_id);
CREATE INDEX idx_pots_group ON pots(group_id);
CREATE INDEX idx_pot_entries_pot ON pot_entries(pot_id);
CREATE INDEX idx_pot_entries_user ON pot_entries(user_id);
