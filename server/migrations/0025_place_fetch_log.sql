-- Throttles how often Overpass gets hit, deliberately decoupled from venue
-- eligibility radius (see venue_pool) — this is what avoids reintroducing
-- grid-boundary-jitter bugs. Jitter across a coarse fetch-throttle bucket
-- here is harmless (worst case: one redundant concurrent fetch); jitter
-- across a tight eligibility boundary was the actual bug fixed by moving
-- to radius-based matching in the first place.
CREATE TABLE place_fetch_log (
  id TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  lat_bucket INTEGER NOT NULL,      -- floor(lat * 2) -> ~0.5 degree bands, index prefilter only
  lng_bucket INTEGER NOT NULL,
  found_any INTEGER NOT NULL,       -- did this fetch discover >=1 venue (weekly+monthly combined)
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_place_fetch_log_bucket_expires ON place_fetch_log(lat_bucket, lng_bucket, expires_at);
