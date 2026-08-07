-- Per-venue image cache, one row per local_challenges.id, so each
-- location-based challenge in a batch can show its own photo instead of
-- every card in a region sharing the one region-level city_images photo.
-- Keyed by the local_challenges id directly since those rows are immutable
-- (an id's venue identity never changes). Same permanent-success /
-- short(er)-negative-TTL split as city_images (see getVenueImage in
-- city-image.ts) — a failed lookup must not be cached forever.
CREATE TABLE venue_images (
  venue_key TEXT PRIMARY KEY,
  image_url TEXT,
  created_at INTEGER NOT NULL
);
