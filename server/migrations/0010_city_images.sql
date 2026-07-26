-- Per-region cache of a "sense of place" background image (city skyline /
-- downtown / notable landmark) shown behind that region's location-based
-- challenges. Resolved once per region (reverse-geocode + Wikipedia lookup,
-- see city-image.ts) and cached indefinitely — no freshness window, unlike
-- the weekly-cadence local_challenges batches themselves.
CREATE TABLE city_images (
  region_key TEXT PRIMARY KEY,
  city_name TEXT,
  image_url TEXT,
  created_at INTEGER NOT NULL
);
