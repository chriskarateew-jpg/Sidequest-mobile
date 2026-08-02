-- Comments on quest posts — flat (no replies/threading), same shape and
-- depth as post_kudos.
CREATE TABLE post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_post_comments_post ON post_comments(post_id, created_at);
