// Gumpa — real nearby-place lookup via OpenStreetMap's Overpass API.
// No API key: Overpass is free and needs no account, which matters for a
// solo project (nothing to sign up for before this feature works). Queried
// only on a local-challenges cache miss (see local-challenges.ts) — never
// on every request — to stay well inside Overpass's usage policy of
// infrequent, cacheable queries.

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_TIMEOUT_MS = 25_000;
const OVERPASS_RETRY_DELAY_MS = 800;
const PER_CATEGORY_LIMIT = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type PlaceCategory = 'park' | 'cafe' | 'restaurant' | 'landmark' | 'destination';

export interface NearbyPlace {
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
}

interface OverpassElement {
  type: string;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
}

// Each category gets its own `out center N;` block rather than one shared
// cap — a single shared limit lets common categories (cafes, restaurants)
// crowd out rarer ones (parks) entirely in dense areas, confirmed against
// the real API before writing this.
function buildCloseQuery(lat: number, lng: number, radiusMeters: number): string {
  const around = `around:${radiusMeters},${lat},${lng}`;
  return `
[out:json][timeout:25];
(
  node["leisure"~"^(park|nature_reserve|garden)$"]["name"](${around});
  way["leisure"~"^(park|nature_reserve|garden)$"]["name"](${around});
);
out center ${PER_CATEGORY_LIMIT};
(
  node["amenity"="cafe"]["name"](${around});
);
out center ${PER_CATEGORY_LIMIT};
(
  node["amenity"="restaurant"]["name"](${around});
);
out center ${PER_CATEGORY_LIMIT};
`.trim();
}

// Landmarks get their own query, at a wider radius, in a separate request
// from the close-by categories — deliberately isolated. Confirmed against
// the real API: a wide tourism/historic radius in a dense city (lots of
// tagged nodes to scan) can blow Overpass's own query timeout, and when it
// does, bundling it into one multi-block query took parks/cafes/restaurants
// down with it — an entire region's local challenges failing because the
// landmark portion alone was too expensive. Splitting the request means a
// landmark timeout only costs the landmark slot, not the whole batch.
function buildLandmarkQuery(lat: number, lng: number, radiusMeters: number): string {
  const around = `around:${radiusMeters},${lat},${lng}`;
  return `
[out:json][timeout:25];
(
  node["tourism"~"^(attraction|museum|viewpoint|artwork)$"]["name"](${around});
  node["historic"~"^(monument|memorial|castle|ruins)$"]["name"](${around});
);
out center ${PER_CATEGORY_LIMIT};
`.trim();
}

// Same tourism/historic tags as the landmark query, at a much wider "day
// trip" radius — reused rather than a new tag set since the distinction
// between "landmark" (weekly, same-town) and "destination" (monthly, worth
// a planned trip) is about distance, not venue type. Isolated into its own
// request for the same reason landmark is split from close: a wide radius
// in a dense city can blow Overpass's 25s timeout, and that must not be
// able to take the weekly close/landmark fetch down with it.
function buildDestinationQuery(lat: number, lng: number, radiusMeters: number): string {
  const around = `around:${radiusMeters},${lat},${lng}`;
  return `
[out:json][timeout:25];
(
  node["tourism"~"^(attraction|museum|viewpoint|artwork)$"]["name"](${around});
  node["historic"~"^(monument|memorial|castle|ruins)$"]["name"](${around});
);
out center ${PER_CATEGORY_LIMIT};
`.trim();
}

function categorize(tags: Record<string, string>): PlaceCategory {
  if (tags.leisure) return 'park';
  if (tags.amenity === 'cafe') return 'cafe';
  if (tags.amenity === 'restaurant') return 'restaurant';
  return 'landmark'; // tourism / historic
}

// Returns [] on any network/timeout/parse failure for *this* query only —
// treated upstream as "nothing from this query right now," not a hard
// error. Never throws, so Promise.all in fetchNearbyPlaces can't have one
// query's failure cancel or block the other. Overpass's public instance is
// free and shared, so a single transient timeout/rate-limit is common
// enough to warrant one retry before giving up on this category — confirmed
// against production logs, where a close-query miss alongside a successful
// landmark query (same request) was the actual cause of an otherwise
// unexplained empty-looking batch.
async function runQuery(query: string, attempt = 1): Promise<OverpassElement[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'Gumpa/1.0 (personal project; contact: chriskarateew@gmail.com)',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`overpass: HTTP ${res.status} on attempt ${attempt}`);
      if (attempt < 2) {
        await sleep(OVERPASS_RETRY_DELAY_MS);
        return runQuery(query, attempt + 1);
      }
      return [];
    }

    const data = (await res.json()) as { elements?: OverpassElement[] };
    return data.elements ?? [];
  } catch (err) {
    console.error(`overpass: request failed on attempt ${attempt}`, err);
    if (attempt < 2) {
      await sleep(OVERPASS_RETRY_DELAY_MS);
      return runQuery(query, attempt + 1);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// categoryOverride lets the destination query force every result to
// 'destination' rather than 'landmark' — same OSM tags as buildLandmarkQuery,
// but the wider radius means these are a different (monthly-cadence) tier,
// not more landmark results.
function elementsToPlaces(elements: OverpassElement[], seen: Set<string>, categoryOverride?: PlaceCategory): NearbyPlace[] {
  const places: NearbyPlace[] = [];
  for (const el of elements) {
    const name = el.tags?.name;
    const point = el.lat != null && el.lon != null ? { lat: el.lat, lng: el.lon } : el.center ? { lat: el.center.lat, lng: el.center.lon } : null;
    if (!name || !point || !el.tags) continue;

    const dedupeKey = name.toLowerCase().trim();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    places.push({ name, category: categoryOverride ?? categorize(el.tags), ...point });
  }
  return places;
}

export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  radiusMeters = 2500,
  landmarkRadiusMeters = 5000
): Promise<NearbyPlace[]> {
  const [closeElements, landmarkElements] = await Promise.all([
    runQuery(buildCloseQuery(lat, lng, radiusMeters)),
    runQuery(buildLandmarkQuery(lat, lng, landmarkRadiusMeters)),
  ]);

  const seen = new Set<string>();
  return [...elementsToPlaces(closeElements, seen), ...elementsToPlaces(landmarkElements, seen)];
}

// Separate request from fetchNearbyPlaces on purpose (see buildDestinationQuery)
// — its own failure domain, its own dedupe set, called independently so a
// slow/failed destination fetch never affects the weekly close/landmark
// result. Caller (local-challenges.ts) is responsible for deduping these
// against whatever fetchNearbyPlaces already picked for the same region,
// since both queries share the same tourism/historic tags and can overlap.
export async function fetchDestinationPlaces(lat: number, lng: number, radiusMeters = 30_000): Promise<NearbyPlace[]> {
  const elements = await runQuery(buildDestinationQuery(lat, lng, radiusMeters));
  return elementsToPlaces(elements, new Set<string>(), 'destination');
}
