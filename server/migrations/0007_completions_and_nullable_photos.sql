-- posts.photo_key becomes nullable — honor/streak completions post text-only
-- (no image). SQLite can't ALTER a column's NOT NULL in place, so rebuild.
CREATE TABLE posts_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  quest_title TEXT NOT NULL,
  quest_desc TEXT NOT NULL,
  photo_key TEXT,
  challenge_id TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO posts_new SELECT id, user_id, quest_title, quest_desc, photo_key, challenge_id, created_at FROM posts;
DROP TABLE posts;
ALTER TABLE posts_new RENAME TO posts;
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_user ON posts(user_id);
CREATE INDEX idx_posts_challenge ON posts(challenge_id);

-- Authoritative "has user X completed challenge Y in period Z" record, for
-- all three verify types (photo/streak/honor) — the UNIQUE constraint is
-- what makes double-completion (and token farming) structurally impossible,
-- closing a gap that existed even for the original photo-only flow.
CREATE TABLE completions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  challenge_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  verify_type TEXT NOT NULL CHECK (verify_type IN ('photo', 'streak', 'honor')),
  progress INTEGER NOT NULL DEFAULT 0,
  target INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'complete')) DEFAULT 'in_progress',
  last_checkin_day TEXT,
  post_id TEXT REFERENCES posts(id),
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, challenge_id, period_key)
);
CREATE INDEX idx_completions_user_period ON completions(user_id, period_key);
