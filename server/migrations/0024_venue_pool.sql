-- Long-lived, deduped real venues discovered from Overpass — replaces the
-- old model of re-fetching Overpass fresh per ~1km grid cell every 7 days.
-- Copy (title/description/long_description) is generated once per venue,
-- not re-billed to Claude on every period. Natural identity is the OSM
-- (type, id) pair, never just the numeric id alone — a node and a way can
-- share the same id and be unrelated real-world objects.
CREATE TABLE venue_pool (
  id TEXT PRIMARY KEY,
  osm_type TEXT NOT NULL,           -- 'node' | 'way' | 'relation'
  osm_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,           -- 'park' | 'cafe' | 'restaurant' | 'landmark' | 'destination'
  subtype TEXT,
  prominent INTEGER NOT NULL DEFAULT 0,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  long_description TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  UNIQUE (osm_type, osm_id)
);
CREATE INDEX idx_venue_pool_category_lat ON venue_pool(category, lat);
