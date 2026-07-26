-- Server-generated, region-cached challenges tied to real nearby places
-- (parks, cafes, restaurants, landmarks) pulled from OpenStreetMap and given
-- short on-brand copy by Claude. Rows are immutable — regeneration inserts a
-- fresh batch with new ids rather than overwriting, so an id already handed
-- to a client stays resolvable for the rest of its period even after the
-- region's cache moves on to a newer batch.
--
-- "description" (not "desc") avoids SQL's DESC keyword — the JSON response
-- renames it to "desc" to match the client's Challenge.desc field, same
-- split already used elsewhere (completions.verify_type vs. the "verify"
-- field everywhere else).
CREATE TABLE local_challenges (
  id TEXT PRIMARY KEY,
  region_key TEXT NOT NULL,
  place_name TEXT NOT NULL,
  place_category TEXT NOT NULL,     -- 'park' | 'cafe' | 'restaurant' | 'landmark'
  place_lat REAL NOT NULL,
  place_lng REAL NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'weekly',
  verify_type TEXT NOT NULL DEFAULT 'photo',
  cat TEXT NOT NULL DEFAULT 'explore',
  tokens INTEGER NOT NULL DEFAULT 60,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_local_challenges_region_created ON local_challenges(region_key, created_at);
