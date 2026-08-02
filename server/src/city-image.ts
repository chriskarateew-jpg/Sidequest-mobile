// Gumpa — resolves a "sense of place" background image for a region's
// location-based challenges. Tries, in order, until one produces an image:
//   1. Reverse-geocode the coarse lat/lng to a city via Nominatim (OSM,
//      free/no key), then pull that place's lead Wikipedia image. Several
//      address fields are tried in turn (city, town, village, ...), each
//      qualified with the state first (e.g. "Woodstock, Vermont") before
//      the bare name, and a candidate is only accepted if the matched
//      page's own coordinates are actually near the requested point — a
//      bare small-town name can otherwise resolve to something more
//      globally notable sharing that name (bare "Woodstock" is the 1969
//      festival, not the Vermont town it was named for here).
//   2. If no named place yields a (geographically-verified) image, fall
//      back to a Wikimedia Commons geosearch centered on the exact
//      lat/lng — real geotagged photos near that spot, free/no key, no
//      dependency on a place name at all.
// Cached per region in D1 forever — a place's photo has no freshness
// window, unlike the weekly challenge batches themselves — so these calls
// only ever run once per region for the lifetime of the app. Only a total
// failure across every fallback means no background image this batch;
// local challenges work fine without one either way.

import type { Env } from './env';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';
const FETCH_TIMEOUT_MS = 10_000;
const THUMB_WIDTH = 1200;
const COMMONS_GEOSEARCH_RADIUS_M = 4000;
const COMMONS_GEOSEARCH_LIMIT = 10;
// How far a matched Wikipedia page's own infobox coordinates may sit from
// the requested point before we reject the match as a probable name
// collision rather than the actual place — e.g. "Woodstock" on its own
// resolves to the 1969 festival, not Woodstock, VT. Generous enough that a
// big city/county's listed centroid (which can legitimately be tens of km
// from a GPS ping at its edge) still passes, while still easily catching a
// same-named place in another state or country, which is normally hundreds
// of km away — not a precise guarantee, just a cheap, effective heuristic.
const MAX_PLACE_DISTANCE_KM = 100;
const USER_AGENT = 'Gumpa/1.0 (personal project; contact: chriskarateew@gmail.com)';
// Only applies to a cached *failure* (image_url null) — a resolved photo
// URL still caches forever below. A permanent negative cache means any
// region that failed once (a transient API hiccup, a since-improved lookup
// chain, a since-added Wikipedia photo) stays black forever with no way to
// self-heal; confirmed live against production — NYC's region cached null
// under the old single-attempt lookup and would keep returning null even
// after this file's fallback chain shipped, without this expiry.
const NEGATIVE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CityImageRow {
  region_key: string;
  city_name: string | null;
  image_url: string | null;
  created_at: number;
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Ordered from most to least specific, and — for each place-level field —
// qualified with the state before the bare name. Wikipedia's own naming
// convention disambiguates same-named small towns as "Place, State" (e.g.
// "Woodstock, Vermont"), so trying the qualified form first is what stops a
// small town's bare name from resolving to something more globally notable
// sharing that name (the bare "Woodstock" is the 1969 festival, not the
// Vermont town). The bare form still follows as a fallback, since large
// cities are usually titled without a state qualifier at all ("New York
// City", not "New York, New York").
function reverseGeocodeCandidates(data: { address?: Record<string, string> } | null): string[] {
  const addr = data?.address ?? {};
  const state = addr.state;
  const places = [addr.city, addr.town, addr.village, addr.municipality, addr.county].filter((v): v is string => !!v);

  const candidates: string[] = [];
  for (const place of places) {
    if (state && state !== place) candidates.push(`${place}, ${state}`);
    candidates.push(place);
  }
  if (state) candidates.push(state);
  return [...new Set(candidates)];
}

async function reverseGeocodeCity(lat: number, lng: number): Promise<string[]> {
  const url = `${NOMINATIM_URL}?lat=${lat}&lon=${lng}&format=jsonv2&zoom=10`;
  const data = (await fetchJson(url)) as { address?: Record<string, string> } | null;
  return reverseGeocodeCandidates(data);
}

// Name qualification alone isn't proof the matched page is the right place
// (a qualified title can still redirect somewhere odd, and a bare one can
// still collide) — so this also requires the matched page's own infobox
// coordinates to actually sit near the requested lat/lng. A page with no
// coordinates at all is treated the same as a mismatch: real place articles
// on Wikipedia almost always carry one, so its absence is itself a sign the
// title resolved to something else (a festival, a person, a band).
async function fetchCityImage(cityName: string, lat: number, lng: number): Promise<string | null> {
  const url = `${WIKI_API_URL}?action=query&titles=${encodeURIComponent(cityName)}&prop=pageimages|coordinates&format=json&pithumbsize=${THUMB_WIDTH}&redirects=1`;
  const data = (await fetchJson(url)) as {
    query?: { pages?: Record<string, { thumbnail?: { source?: string }; coordinates?: { lat: number; lon: number }[] }> };
  } | null;
  const pages = data?.query?.pages ?? {};
  for (const page of Object.values(pages)) {
    if (!page.thumbnail?.source) continue;
    const coord = page.coordinates?.[0];
    if (!coord || haversineKm(lat, lng, coord.lat, coord.lon) > MAX_PLACE_DISTANCE_KM) continue;
    return page.thumbnail.source;
  }
  return null;
}

// Fallback for when no address-derived place name has a Wikipedia lead
// image: search Wikimedia Commons directly for photos geotagged near the
// exact coordinates, no place name required at all.
async function fetchCommonsNearbyImage(lat: number, lng: number): Promise<string | null> {
  const searchUrl = `${COMMONS_API_URL}?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=${COMMONS_GEOSEARCH_RADIUS_M}&gsnamespace=6&gslimit=${COMMONS_GEOSEARCH_LIMIT}&format=json`;
  const searchData = (await fetchJson(searchUrl)) as { query?: { geosearch?: { title: string }[] } } | null;
  const titles = searchData?.query?.geosearch?.map((g) => g.title) ?? [];
  if (titles.length === 0) return null;

  const infoUrl = `${COMMONS_API_URL}?action=query&titles=${encodeURIComponent(titles.join('|'))}&prop=imageinfo&iiprop=url&iiurlwidth=${THUMB_WIDTH}&format=json`;
  const infoData = (await fetchJson(infoUrl)) as {
    query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; url?: string }[] }> };
  } | null;
  const pages = infoData?.query?.pages ?? {};
  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (info?.thumburl) return info.thumburl;
    if (info?.url) return info.url;
  }
  return null;
}

// Returns null (and caches that null, for NEGATIVE_CACHE_TTL_MS only) when
// every fallback above comes up empty. A hit is cached forever — a place's
// photo doesn't go stale — but a miss is retried periodically instead of
// permanently, since a miss is far more likely to be a transient/lookup-chain
// limitation than a real absence of any image anywhere for that region.
export async function getCityImageForRegion(env: Env, regionKey: string, lat: number, lng: number): Promise<string | null> {
  const cached = await env.DB.prepare('SELECT * FROM city_images WHERE region_key = ?').bind(regionKey).first<CityImageRow>();
  if (cached && (cached.image_url !== null || Date.now() - cached.created_at < NEGATIVE_CACHE_TTL_MS)) {
    return cached.image_url;
  }

  const candidates = await reverseGeocodeCity(lat, lng);
  let imageUrl: string | null = null;
  let matchedName: string | null = null;
  for (const candidate of candidates) {
    imageUrl = await fetchCityImage(candidate, lat, lng);
    if (imageUrl) {
      matchedName = candidate;
      break;
    }
  }
  if (!imageUrl) {
    imageUrl = await fetchCommonsNearbyImage(lat, lng);
  }

  await env.DB.prepare('INSERT OR REPLACE INTO city_images (region_key, city_name, image_url, created_at) VALUES (?, ?, ?, ?)')
    .bind(regionKey, matchedName ?? candidates[0] ?? null, imageUrl, Date.now())
    .run();

  return imageUrl;
}
