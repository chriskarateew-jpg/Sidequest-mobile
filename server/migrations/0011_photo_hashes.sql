-- App-wide duplicate-photo detection (see server/src/photo-hash.ts). One row
-- per verified photo submission (every streak check-in, not just the one
-- that ends up as a feed post) — a perceptual hash close enough to an
-- existing row means the same photo was forwarded/reused, regardless of
-- which challenge it's submitted against.
CREATE TABLE photo_hashes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  phash TEXT NOT NULL,
  lat REAL,
  lng REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_photo_hashes_created ON photo_hashes(created_at);
