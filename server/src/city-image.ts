// Sidequest — resolves a "sense of place" background image for a region's
// location-based challenges: reverse-geocodes the coarse lat/lng to a city
// via Nominatim (OpenStreetMap, free/no key), then pulls that city's lead
// Wikipedia image (almost always a skyline, downtown, or notable landmark
// shot) via the MediaWiki API. Cached per region in D1 forever — a city's
// skyline photo has no freshness window, unlike the weekly challenge batches
// themselves — so the two free external calls below only ever run once per
// region for the lifetime of the app. Any failure just means no background
// image this batch; local challenges work fine without one.

import type { Env } from './env';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const FETCH_TIMEOUT_MS = 10_000;
const THUMB_WIDTH = 1200;
const USER_AGENT = 'Gumption/1.0 (personal project; contact: chriskarateew@gmail.com)';

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

async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  const url = `${NOMINATIM_URL}?lat=${lat}&lon=${lng}&format=jsonv2&zoom=10`;
  const data = (await fetchJson(url)) as { address?: Record<string, string> } | null;
  const addr = data?.address ?? {};
  return addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.county ?? null;
}

async function fetchCityImage(cityName: string): Promise<string | null> {
  const url = `${WIKI_API_URL}?action=query&titles=${encodeURIComponent(cityName)}&prop=pageimages&format=json&pithumbsize=${THUMB_WIDTH}&redirects=1`;
  const data = (await fetchJson(url)) as { query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } } | null;
  const pages = data?.query?.pages ?? {};
  for (const page of Object.values(pages)) {
    if (page.thumbnail?.source) return page.thumbnail.source;
  }
  return null;
}

// Returns null (and caches that null) when no city name or no Wikipedia
// image could be resolved — a permanent negative cache, since another
// attempt for the same region is no more likely to succeed later.
export async function getCityImageForRegion(env: Env, regionKey: string, lat: number, lng: number): Promise<string | null> {
  const cached = await env.DB.prepare('SELECT * FROM city_images WHERE region_key = ?').bind(regionKey).first<CityImageRow>();
  if (cached) return cached.image_url;

  const cityName = await reverseGeocodeCity(lat, lng);
  const imageUrl = cityName ? await fetchCityImage(cityName) : null;

  await env.DB.prepare('INSERT OR REPLACE INTO city_images (region_key, city_name, image_url, created_at) VALUES (?, ?, ?, ?)')
    .bind(regionKey, cityName, imageUrl, Date.now())
    .run();

  return imageUrl;
}
