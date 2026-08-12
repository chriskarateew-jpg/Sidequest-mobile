// Gumpa — real nearby-place lookup via OpenStreetMap's Overpass API.
// No API key: Overpass is free and needs no account, which matters for a
// solo project (nothing to sign up for before this feature works). Queried
// only on a local-challenges cache miss (see local-challenges.ts) — never
// on every request — to stay well inside Overpass's usage policy of
// infrequent, cacheable queries.

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_TIMEOUT_MS = 25_000;
const OVERPASS_RETRY_DELAY_MS = 800;
// Overpass's `out center N` only caps how many results get serialized, not
// the cost of the underlying `around:` scan, so raising this isn't a new
// timeout risk on its own. Raised from 8 now that the weekly radius pool
// population uses (see local-challenges.ts) jumps to a flat 8km — a dense
// area needs a bigger raw sample for the prominence ranking downstream to
// have real signal to work with. Kept at 20 rather than higher, given how
// fragile Overpass proved under tonight's testing — worth tuning from real
// logs rather than guessing further.
const PER_CATEGORY_LIMIT = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type PlaceCategory = 'park' | 'cafe' | 'restaurant' | 'landmark' | 'destination';

export interface NearbyPlace {
  name: string;
  category: PlaceCategory;
  // Raw OSM hint for what kind of 'park' or 'landmark' this actually is
  // (beach, nature reserve, theatre, ...) — undefined for plain parks/
  // tourism attractions where the category alone is already specific enough.
  // Passed through to Claude's copy prompt (local-challenges.ts) so a beach
  // gets "take a swim," not "take a walk."
  subtype?: string;
  // True when OSM itself links this place to a Wikipedia/Wikidata entry —
  // a cheap, reliable proxy for "this is a genuinely known place," not just
  // technically tagged the right way. A subdivision's tiny named common
  // area almost never has one; a wildlife management area or a real venue
  // almost always does. Used to prefer prominent results over obscure ones
  // within the same category (see selectVenuesForCategory in local-challenges.ts).
  prominent: boolean;
  // OSM's own stable identity for this real-world place — the natural key
  // used to upsert into the venue_pool table (local-challenges.ts) so the
  // same physical place always maps to the same pool row no matter how
  // many times, or from which nearby coordinate, it gets rediscovered.
  // Deliberately the (type, id) *pair* — a node and a way can share the
  // same numeric id and be unrelated real-world objects.
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
  lat: number;
  lng: number;
}

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
}

export interface CloseRadii {
  park: number;
  cafe: number;
  restaurant: number;
}

// Parks/cafes/restaurants get independent radii, not one shared value —
// parks are naturally sparser even in mixed-density areas (confirmed via a
// real miss: a named park 4.6km out fell outside a 2.5km shared radius),
// while cafes/restaurants are kept tighter since they're usually genuinely
// close in a real town center and widening them risks crowding city results
// for little rural benefit. Each category gets its own `out center N;`
// block rather than one shared cap — a single shared limit lets common
// categories (cafes, restaurants) crowd out rarer ones (parks) entirely in
// dense areas, confirmed against the real API before writing this.
// The park block now also queries `rel`, not just node/way — confirmed
// live that a real, well-known nearby park can be mapped as an OSM
// *relation* (multipolygon), which the query never included at all before
// this. Deliberately does NOT also pull in beaches/protected areas here —
// tested live and bundling those tags into this same request pushed it
// well past Overpass's 25s timeout; they get their own narrower, isolated
// request instead (see buildNatureQuery) for the same reason landmark and
// destination are already split out.
function buildCloseQuery(lat: number, lng: number, radii: CloseRadii): string {
  const parkAround = `around:${radii.park},${lat},${lng}`;
  const cafeAround = `around:${radii.cafe},${lat},${lng}`;
  const restaurantAround = `around:${radii.restaurant},${lat},${lng}`;
  return `
[out:json][timeout:25];
(
  node["leisure"~"^(park|nature_reserve|garden)$"]["name"](${parkAround});
  way["leisure"~"^(park|nature_reserve|garden)$"]["name"](${parkAround});
  rel["leisure"~"^(park|nature_reserve|garden)$"]["name"](${parkAround});
);
out center ${PER_CATEGORY_LIMIT};
(
  node["amenity"="cafe"]["name"](${cafeAround});
);
out center ${PER_CATEGORY_LIMIT};
(
  node["amenity"="restaurant"]["name"](${restaurantAround});
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
// Also covers "fun and unique" weekly-scale spots beyond tourism/historic —
// a distinctive local shop, an ice cream stop, mini golf, an arcade — added
// after a user pointed out weekly tasks kept landing on a plain
// subdivision park because that was the *only* category with any nearby
// candidates at all; landmark-tier venues are just as valid a weekly pick
// (see CATEGORY_PROFILE) but this location genuinely had none until this
// tag set widened what counts as one. Deliberately node/way only, no
// `rel` — simple shop/amenity/leisure point tags are cheap the same way
// cafe/restaurant already are, unlike the boundary/protected-area
// relation lookups that proved expensive tonight (see buildNatureQuery).
function buildLandmarkQuery(lat: number, lng: number, radiusMeters: number): string {
  const around = `around:${radiusMeters},${lat},${lng}`;
  return `
[out:json][timeout:25];
(
  node["tourism"~"^(attraction|museum|viewpoint|artwork|gallery)$"]["name"](${around});
  node["historic"~"^(monument|memorial|castle|ruins)$"]["name"](${around});
  node["amenity"~"^(theatre|arts_centre|cinema|ice_cream)$"]["name"](${around});
  way["amenity"~"^(theatre|arts_centre|cinema)$"]["name"](${around});
  node["leisure"~"^(miniature_golf|bowling_alley|amusement_arcade)$"]["name"](${around});
  way["leisure"~"^(miniature_golf|bowling_alley|amusement_arcade)$"]["name"](${around});
  node["shop"~"^(gift|books|art|antiques|toys|music|chocolate|florist)$"]["name"](${around});
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
  node["amenity"~"^(theatre|arts_centre|cinema)$"]["name"](${around});
  way["amenity"~"^(theatre|arts_centre|cinema)$"]["name"](${around});
);
out center ${PER_CATEGORY_LIMIT};
`.trim();
}

// Protected nature areas (wildlife management areas, state parks/reserves)
// and named beaches, isolated into their own request rather than folded
// into buildDestinationQuery — tested live against a real region and
// bundling these tags in with tourism/historic/theatre pushed the combined
// request well past Overpass's 25s timeout even at this same wide radius.
//
// `rel["leisure"="nature_reserve"]` IS included, unlike
// `rel["boundary"="protected_area"]` below — tested each in isolation and
// they are not equally expensive: the nature_reserve relation query
// consistently completed in a few seconds, while the protected_area one
// reliably failed outright even alone. This matters concretely: a large,
// well-known state park/preserve (e.g. Florida's Paynes Prairie Preserve)
// is almost always mapped as a relation, and `way`-only was silently
// dropping exactly this kind of place — the wide-radius protected-area
// destination a user specifically wanted to see, and a genuinely great
// candidate (linked to Wikipedia/Wikidata, so it also ranks as prominent —
// see NearbyPlace.prominent) that a `way`-only search could never surface.
// `rel["boundary"="protected_area"]` stays way/node-only, no `rel` — that
// specific combination is the one confirmed too expensive to keep; a
// protected area not also tagged leisure=nature_reserve is a smaller loss
// than the reliability cost of adding it back.
function buildNatureQuery(lat: number, lng: number, radiusMeters: number): string {
  const around = `around:${radiusMeters},${lat},${lng}`;
  return `
[out:json][timeout:25];
(
  way["boundary"="protected_area"]["name"](${around});
  way["leisure"="nature_reserve"]["name"](${around});
  rel["leisure"="nature_reserve"]["name"](${around});
  node["natural"="beach"]["name"](${around});
  way["natural"="beach"]["name"](${around});
);
out center ${PER_CATEGORY_LIMIT};
`.trim();
}

// Only the three park-ish leisure values route to 'park' — a bare
// `tags.leisure` truthy check used to also catch the newer fun/unique
// leisure tags (miniature_golf, bowling_alley, amusement_arcade), wrongly
// bucketing "play a round of mini golf" in with "walk through a park."
function categorize(tags: Record<string, string>): PlaceCategory {
  if (tags.leisure === 'park' || tags.leisure === 'nature_reserve' || tags.leisure === 'garden') return 'park';
  if (tags.natural === 'beach' || tags.boundary === 'protected_area') return 'park';
  if (tags.amenity === 'cafe') return 'cafe';
  if (tags.amenity === 'restaurant') return 'restaurant';
  return 'landmark'; // tourism / historic / theatre / arts_centre / cinema / gallery / ice_cream / mini golf / bowling / arcade / unique shop
}

// Names containing these terms get excluded outright, regardless of which
// OSM tag matched them — confirmed live that OSM's own tagging is not a
// reliable safety signal on its own: a real sex club was tagged plainly
// amenity=theatre, indistinguishable by tag from a legitimate community
// theater, and got recommended as a real task before this filter existed.
// This app is public-facing (see AGENTS.md's product scope) and task
// photos are real people's real visits, so a false negative here (missing
// a genuinely inappropriate venue) is a much worse outcome than a false
// positive (skipping a legitimate business whose name happens to contain
// one of these words) — err toward excluding.
const INAPPROPRIATE_NAME_PATTERN = /\b(adult|strip\s*club|gentlemen'?s\s*club|sex\s*(club|shop)|swinger|xxx|erotic|nude|topless|escort|bdsm|fetish|peep\s*show|gogo\s*bar)\b/i;

function isInappropriateVenue(name: string): boolean {
  return INAPPROPRIATE_NAME_PATTERN.test(name);
}

// Surfaces the specific real-world thing behind a 'park' or 'landmark'
// category when it's genuinely a beach, nature reserve, or something more
// specific than "attraction" — see NearbyPlace.subtype.
function deriveSubtype(tags: Record<string, string>): string | undefined {
  if (tags.natural === 'beach') return 'beach';
  if (tags.boundary === 'protected_area' || tags.leisure === 'nature_reserve') return 'nature reserve';
  if (tags.amenity === 'theatre') return 'theatre';
  if (tags.amenity === 'arts_centre') return 'arts venue';
  if (tags.amenity === 'cinema') return 'cinema';
  if (tags.amenity === 'ice_cream') return 'ice cream shop';
  if (tags.leisure === 'miniature_golf') return 'mini golf course';
  if (tags.leisure === 'bowling_alley') return 'bowling alley';
  if (tags.leisure === 'amusement_arcade') return 'arcade';
  if (tags.tourism === 'gallery') return 'art gallery';
  if (tags.shop) return `${tags.shop} shop`;
  return undefined;
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
    if (isInappropriateVenue(name)) continue;

    const dedupeKey = name.toLowerCase().trim();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    places.push({
      name,
      category: categoryOverride ?? categorize(el.tags),
      subtype: deriveSubtype(el.tags),
      prominent: !!(el.tags.wikipedia || el.tags.wikidata),
      osmType: el.type as 'node' | 'way' | 'relation',
      osmId: el.id,
      ...point,
    });
  }
  return places;
}

// Defaults are per-category, not one shared radius — see buildCloseQuery.
// Cafe/restaurant stay tight on purpose (a coffee run or dinner spot should
// still feel "nearby," and these are the categories most likely to be
// genuinely dense in a real town center); park is wider since it's the
// category confirmed to fall through a tight shared radius in a real,
// spread-out area.
export const DEFAULT_CLOSE_RADII: CloseRadii = { park: 6000, cafe: 2500, restaurant: 3000 };

// Radii for the venue_pool population path (see populateVenuePool in
// local-challenges.ts) — flat per-tier, not per-category, per the product
// decision to use one weekly radius and one monthly radius rather than
// density-adaptive or category-differentiated ones. Weekly widened from
// the old 2.5-6km category split to a flat 8km after confirming live that
// the old tighter radii kept surfacing the same one or two mediocre nearby
// parks with nothing to compete against them. Monthly widened from 30km to
// 45km so two moderately-separated small towns can plausibly share a
// destination between them (the motivating example: two Florida cities
// ~60km apart both reaching a shared landmark roughly between them).
export const POOL_WEEKLY_RADII: CloseRadii = { park: 8000, cafe: 8000, restaurant: 8000 };
export const POOL_WEEKLY_LANDMARK_RADIUS_M = 8000;
export const POOL_MONTHLY_RADIUS_M = 45_000;

export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  radii: CloseRadii = DEFAULT_CLOSE_RADII,
  landmarkRadiusMeters = 5000
): Promise<NearbyPlace[]> {
  const [closeElements, landmarkElements] = await Promise.all([
    runQuery(buildCloseQuery(lat, lng, radii)),
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

// Own request (see buildNatureQuery) — kept separate from
// fetchDestinationPlaces because tested live, bundling protected-area/beach
// tags in with tourism/historic/theatre pushed the combined request past
// Overpass's 25s timeout even at the wide destination radius. category/
// radiusMeters are parameterized (not hardcoded to 'destination'/30km)
// specifically so the *weekly* tier can also pull in a genuinely close
// beach or nature reserve, not just the monthly one — a beach a few km
// away reads as a normal weekly outing, not a special trip, and confirmed
// live that without this a weekly park search can only ever surface plain
// leisure=park/nature_reserve/garden venues, missing exactly this kind of
// real, worthwhile nearby place. Caller merges this with whichever other
// tier's results it belongs to (see populateVenuePool in local-challenges.ts).
export async function fetchNaturePlaces(
  lat: number,
  lng: number,
  radiusMeters: number,
  category: PlaceCategory
): Promise<NearbyPlace[]> {
  const elements = await runQuery(buildNatureQuery(lat, lng, radiusMeters));
  return elementsToPlaces(elements, new Set<string>(), category);
}
