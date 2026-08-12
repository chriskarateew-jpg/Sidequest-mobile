// Gumpa — location-flavored challenges tied to real nearby places.
// GET /local-challenges matches a user's exact lat/lng against a shared
// pool of real venues (venue_pool, populated from OpenStreetMap via
// places.ts) by distance, not by which coarse grid cell they happen to
// round into — two nearby users whose radius both reach the same
// prominent venue converge on the identical challenge, by geometry, not
// by landing in the same cell. Weekly radius ~8km, monthly ~45km, flat for
// everyone regardless of density.
//
// A pool venue becomes a user-facing `local_challenges` row ("materialized")
// the first time any user's selection for the current period picks it —
// immutable once created, same guarantee as before: an id already handed
// to a client stays resolvable via getLocalChallengeById for the rest of
// whatever period it was suggested in, since every downstream consumer
// (complete.ts, verify.ts, duels.ts, boosts.ts) only ever does a flat
// `WHERE id = ?` lookup and never reads region_key/venue_id/period_key.

import { requireAuth } from './auth';
import { getCityImageForRegion, getVenueImage } from './city-image';
import type { Env } from './env';
import { haversineMeters } from './geo';
import { error, json } from './http';
import {
  fetchDestinationPlaces,
  fetchNaturePlaces,
  fetchNearbyPlaces,
  POOL_MONTHLY_RADIUS_M,
  POOL_WEEKLY_LANDMARK_RADIUS_M,
  POOL_WEEKLY_RADII,
  type NearbyPlace,
  type PlaceCategory,
} from './places';
import { computePeriodKey } from './period';
import { checkRateLimit } from './ratelimit';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TITLE_LENGTH = 60;
const MAX_DESC_LENGTH = 140;
// The card's one-sentence desc has to stay skimmable in a list; this is for
// the tap-to-expand detail view only (src/components/location-detail-modal.tsx),
// so it can afford 2-3 sentences of real context instead of one line.
const MAX_LONG_DESC_LENGTH = 400;
const VENUES_PER_CATEGORY = 2;
// A handful of destination candidates, not just one — selectVenuesForCategory
// always includes the single most-prominent eligible venue plus a
// period-rotated selection of the rest, so a few slots let that rotation
// actually show something across different months instead of always being
// forced down to one.
const DESTINATION_VENUES_LIMIT = 3;
const WEEKLY_CATEGORIES: PlaceCategory[] = ['park', 'cafe', 'restaurant', 'landmark'];
// How many eligible venues (already ranked by prominence) a category's
// selection draws from — bounds the rotation pool without needing every
// eligible venue to be considered every request.
const SELECTION_TOP_K = 5;

// Close/landmark categories land on the weekly slate — a single sit-down
// visit. Landmarks (museums, monuments, viewpoints, and the wider "fun and
// unique" tag set — see places.ts) take more effort than a coffee run, so
// they carry a higher reward within that same cadence (matches the static
// w-tourist reward) rather than being bumped to monthly. Destination venues
// are the monthly tier: a real trip out of town is a bigger ask than
// anything weekly, so it carries the highest reward.
const CATEGORY_PROFILE: Record<PlaceCategory, { cadence: 'weekly' | 'monthly'; tokens: number }> = {
  park: { cadence: 'weekly', tokens: 60 },
  cafe: { cadence: 'weekly', tokens: 60 },
  restaurant: { cadence: 'weekly', tokens: 60 },
  landmark: { cadence: 'weekly', tokens: 75 },
  destination: { cadence: 'monthly', tokens: 150 },
};

export interface LocalChallengeRow {
  id: string;
  region_key: string;
  venue_id: string | null;
  period_key: string | null;
  place_name: string;
  place_category: string;
  place_lat: number;
  place_lng: number;
  title: string;
  description: string;
  long_description: string;
  cadence: string;
  verify_type: string;
  tokens: number;
  created_at: number;
}

interface VenuePoolRow {
  id: string;
  osm_type: string;
  osm_id: number;
  name: string;
  category: PlaceCategory;
  subtype: string | null;
  prominent: number; // 0/1 — SQLite has no real boolean
  lat: number;
  lng: number;
  title: string;
  description: string;
  long_description: string;
  first_seen_at: number;
  last_seen_at: number;
}

// Rounding to 2 decimal places is a ~1km grid cell at US latitudes. No
// longer used for caching or eligibility (see venue_pool/place_fetch_log
// for the distance-based replacements) — kept only because
// getCityImageForRegion still legitimately keys its own unrelated cache by
// region, and because populated for observability on local_challenges rows.
function bucketRegionKey(lat: number, lng: number): string {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return `${round2(lat).toFixed(2)},${round2(lng).toFixed(2)}`;
}

function toClientChallenge(row: LocalChallengeRow, bgImage: string | null) {
  // Always 'camera' — a local challenge is a real-venue visit by
  // construction, never a screenshot task (see ProofType in tokens.ts).
  return {
    id: row.id,
    cadence: row.cadence,
    tokens: row.tokens,
    title: row.title,
    desc: row.description,
    longDesc: row.long_description || row.description,
    placeName: row.place_name,
    lat: row.place_lat,
    lng: row.place_lng,
    verify: row.verify_type,
    proofType: 'camera' as const,
    ...(bgImage ? { bgImage } : {}),
  };
}

export async function getLocalChallengeById(env: Env, id: string): Promise<LocalChallengeRow | null> {
  return env.DB.prepare('SELECT * FROM local_challenges WHERE id = ?').bind(id).first<LocalChallengeRow>();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Meters between two coordinates — used only to flag genuinely walkable
// venue pairs (see NEARBY_VENUE_RADIUS_M) to Claude as optional flavor, not
// for any verification logic (that stays tied to a single venue's own
// place_lat/place_lng via server/src/geo.ts's haversineMeters directly).
const NEARBY_VENUE_RADIUS_M = 400;

function buildCopyPrompt(venues: NearbyPlace[]): string {
  return [
    'You write short, upbeat challenge copy for a personal-growth app called Gumpa.',
    'For each real place below, write three things: a task title (imperative, under 8 words, e.g. "Run a loop',
    'through Depot Park"), a one-sentence card description (under 20 words) nudging the user to actually go visit',
    'it, and a longer description (2-3 sentences, under 60 words) for a detail view the user opens by tapping in.',
    'The long description can go into more real context or history about the place than the short one has room',
    'for, and should end by reminding the user to get a photo there as their proof.',
    '',
    'Ground the title and both descriptions in something specific and genuinely known about that named place —',
    'a signature dish or drink, a distinctive feature, what it\'s actually known for locally — using your own',
    'knowledge of it. Never fall back to describing the category instead of the place: "Explore SoHo\'s streets',
    'and architecture" is a category-level cop-out for a neighborhood; something like "Photograph a cast-iron',
    'facade on Greene Street" names an actual, specific thing to go do. If you genuinely have nothing specific',
    'for a given place, write the most concrete plausible action for that category rather than a vague nudge',
    '("look around", "explore", "check it out").',
    '',
    'Vary your sentence openings and structure across this whole list. Do not start more than one entry with the',
    'same opening word or verb (e.g. two entries both starting "Take a walk through..."). Each place should feel',
    'like it got its own distinct writing, not a template with the name swapped in.',
    '',
    'Some places below are listed with a "near:" note naming another real place from this same list that is an',
    'easy walk away. When that helps the copy (never forced, only when it reads naturally), you may mention',
    'stopping at that second place too, e.g. "Walk the trail at Depot Park, then grab a coffee next door at Bean',
    'There." Only ever reference places by the exact names given to you here, and only state what their category',
    'implies (a cafe serves coffee/drinks, a restaurant serves food) — never invent a specific dish, item, or',
    'price for a place you were not given real details about.',
    '',
    'Only state facts you are confident are well-established and still true — do not invent hours, prices, or',
    'specifics you are unsure of, and skip unverifiable superlatives ("the best", "world-famous").',
    '',
    'Never use em dashes (—). Use a period, comma, or colon instead.',
    '',
    'A place listed as a "beach" is for swimming/the shore, not walking through like a park; a "nature reserve" is',
    'for hiking/wildlife, not a manicured park; a "theatre"/"arts venue"/"cinema" is for a show, not a stroll —',
    'write the action that actually fits, not the generic park verb.',
    '',
    'Places:',
    ...venues.map((v, i) => {
      const nearby = venues
        .filter((other) => other !== v && haversineMeters(v.lat, v.lng, other.lat, other.lng) <= NEARBY_VENUE_RADIUS_M)
        .map((other) => other.name);
      const nearNote = nearby.length > 0 ? ` (near: ${nearby.join(', ')})` : '';
      const subtypeNote = v.subtype ? `, ${v.subtype}` : '';
      return `${i + 1}. ${v.name} (${v.category}${subtypeNote})${nearNote}`;
    }),
    '',
    `Respond with ONLY minified JSON, no other text: an array of exactly ${venues.length} objects in the same order: [{"title":"...","desc":"...","longDesc":"..."}]`,
  ].join('\n');
}

function normalizeCopy(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, maxLength);
  return trimmed || null;
}

// The prompt above explicitly tells Claude not to write category-level copy
// ("Explore SoHo's streets and architecture") instead of naming the actual
// place — but that's an instruction, not a guarantee, and Claude sometimes
// ignores it and writes exactly that kind of generic filler anyway (observed
// directly: it produced "Explore a new neighborhood" for a real venue, the
// literal example the app's own docs/challenge-writing-guide.md calls out as
// the canonical failure case). A title that never names the venue has
// collapsed into a category, which makes /verify trivially easy to satisfy
// with almost any photo taken in the general vicinity — undermining the
// whole point of photo-verified proof. Requiring the venue's own name to
// appear is a cheap, reliable proxy for "still specific," since the
// templated fallback below is specific by construction.
function mentionsVenue(title: string, venueName: string): boolean {
  const titleLower = title.toLowerCase();
  const words = venueName.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  return words.some((w) => titleLower.includes(w));
}

// Multiple variants per category, not one — several venues of the same
// category can need a fallback in the same pool-population pass, and when
// Claude's copy fails validation for more than one of them (observed live:
// a whole batch fell back to templated copy after a Claude request
// failure), every fallback used to read as the exact same opening phrase.
// Picking a variant by each venue's position within its own category (see
// populateVenuePool) keeps the fallback deterministic and free, just no
// longer identical.
const CATEGORY_TEMPLATES: Record<PlaceCategory, { verb: string; desc: string; longDesc: string }[]> = {
  park: [
    {
      verb: 'Take a walk through',
      desc: 'A nearby park worth stretching your legs at.',
      longDesc: 'A real, nameable park close enough for a quick visit. Head over, take a walk, and snap a photo to prove you made it.',
    },
    {
      verb: 'Spend some time at',
      desc: 'A nearby green space worth checking out in person.',
      longDesc: 'A local green space worth stepping away from a screen for. No agenda needed, just go see it in person.',
    },
    {
      verb: 'Go unwind at',
      desc: 'A nearby park worth a visit.',
      longDesc: 'A nearby spot to slow down for a few minutes. Worth the short trip, and worth a photo once you get there.',
    },
  ],
  cafe: [
    {
      verb: 'Grab a coffee at',
      desc: 'A nearby cafe worth trying in person.',
      longDesc: 'A real, local cafe near you. Stop in, grab a coffee, and get a photo to show you actually went.',
    },
    {
      verb: 'Stop by',
      desc: 'A nearby coffee spot worth a visit.',
      longDesc: 'A nearby coffee spot worth trying instead of the usual place. Pop in for a drink and snap a photo while you are there.',
    },
    {
      verb: 'Treat yourself at',
      desc: 'A nearby cafe worth checking out.',
      longDesc: 'A local cafe worth a short trip. Treat yourself to something, then get a photo to lock in the visit.',
    },
  ],
  restaurant: [
    {
      verb: 'Grab a bite at',
      desc: 'A nearby restaurant worth trying in person.',
      longDesc: 'A real, local restaurant near you. Go grab a bite and snap a photo once you are there to prove the visit.',
    },
    {
      verb: 'Have a meal at',
      desc: 'A nearby spot worth eating at.',
      longDesc: 'A nearby place worth a meal. Head over, eat, and get a photo showing you made it.',
    },
    {
      verb: 'Try out',
      desc: 'A nearby restaurant worth a visit.',
      longDesc: 'A local restaurant worth trying instead of your usual order. Go check it out and snap a photo while you are there.',
    },
  ],
  landmark: [
    {
      verb: 'Go visit',
      desc: 'A nearby landmark worth seeing in person.',
      longDesc: 'A real, nameable landmark near you, worth seeing up close instead of just knowing about it. Go take a look and get a photo.',
    },
    {
      verb: 'Check out',
      desc: 'A nearby sight worth a look.',
      longDesc: 'A local landmark worth a short trip. Go see it for yourself and snap a photo once you are there.',
    },
    {
      verb: 'Go see',
      desc: 'A nearby landmark worth stopping at.',
      longDesc: 'A nearby landmark worth stopping at in person. Head over and get a photo to prove you went.',
    },
  ],
  destination: [
    {
      verb: 'Plan a day trip to',
      desc: 'A destination worth the trip out.',
      longDesc: 'A real destination worth setting aside time for, a bigger outing than your usual weekly tasks. Plan the trip and bring back a photo.',
    },
    {
      verb: 'Make the trip out to',
      desc: 'A spot worth planning a day around.',
      longDesc: 'A destination worth building a day around. Make the trip out, and get a photo once you arrive.',
    },
    {
      verb: 'Go explore',
      desc: 'A destination worth setting aside a day for.',
      longDesc: 'A real place worth the drive, further out than your usual weekly tasks. Go explore it and snap a photo to show you made it.',
    },
  ],
};

// Plain, non-LLM copy for a single venue — never fails, never needs a
// network call. Used both as venue_pool's immediate placeholder at insert
// time (so a row is never left in a "pending copy" state) and as
// generateCopy's per-venue fallback. variantIndex is the venue's position
// among same-category venues in the current pass, so two venues of the
// same category never get the exact same fallback phrasing.
function templatedCopy(venue: NearbyPlace, variantIndex: number): { title: string; desc: string; longDesc: string } {
  const variants = CATEGORY_TEMPLATES[venue.category];
  const { verb, desc, longDesc } = variants[variantIndex % variants.length];
  const title = normalizeCopy(`${verb} ${venue.name}`, MAX_TITLE_LENGTH) ?? venue.name.slice(0, MAX_TITLE_LENGTH);
  return { title, desc, longDesc };
}

// One Claude call per pool-population pass (not per venue) — and Claude's
// job is copy only. Cadence/verify/tokens are always assigned by us,
// never by the model, so a bad generation can't produce structurally weird
// challenges. Always returns exactly venues.length entries: Claude's copy
// is layered over a fully-templated fallback per venue, so a bad/missing
// model response for one venue (or all of them, or Claude being
// unreachable) degrades to plain-but-correct copy instead of losing the
// entire pass.
async function generateCopy(env: Env, venues: NearbyPlace[]): Promise<{ title: string; desc: string; longDesc: string }[]> {
  const categorySeen = new Map<PlaceCategory, number>();
  const fallback = venues.map((v) => {
    const variantIndex = categorySeen.get(v.category) ?? 0;
    categorySeen.set(v.category, variantIndex + 1);
    return templatedCopy(v, variantIndex);
  });

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, messages: [{ role: 'user', content: buildCopyPrompt(venues) }] }),
    });
  } catch (err) {
    console.error('local-challenges: Claude request threw, using templated copy', err);
    return fallback;
  }
  if (!anthropicRes.ok) {
    console.error(`local-challenges: Claude responded ${anthropicRes.status}, using templated copy`);
    return fallback;
  }

  const data = (await anthropicRes.json()) as { content?: { text?: string }[] };
  const raw = data.content?.[0]?.text ?? '';
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) {
    console.error('local-challenges: no JSON array in Claude response, using templated copy');
    return fallback;
  }

  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length !== venues.length) {
      console.error(`local-challenges: Claude returned ${Array.isArray(parsed) ? parsed.length : typeof parsed} items, expected ${venues.length} — using templated copy`);
      return fallback;
    }

    return parsed.map((item, i) => {
      const title = normalizeCopy((item as Record<string, unknown>)?.title, MAX_TITLE_LENGTH);
      const desc = normalizeCopy((item as Record<string, unknown>)?.desc, MAX_DESC_LENGTH);
      if (!title || !desc) {
        console.error(`local-challenges: malformed copy for "${venues[i].name}", using templated fallback for that venue`);
        return fallback[i];
      }
      if (!mentionsVenue(title, venues[i].name)) {
        console.error(`local-challenges: generated title "${title}" never names "${venues[i].name}", using templated fallback for that venue`);
        return fallback[i];
      }
      // longDesc is validated on its own, separate from title/desc above —
      // a missing/malformed long description alone shouldn't discard an
      // otherwise-good title and short desc, so this falls back to just the
      // templated longDesc for this venue rather than the whole item.
      const longDesc = normalizeCopy((item as Record<string, unknown>)?.longDesc, MAX_LONG_DESC_LENGTH) ?? fallback[i].longDesc;
      return { title, desc, longDesc };
    });
  } catch (err) {
    console.error('local-challenges: JSON.parse failed on Claude response, using templated copy', err);
    return fallback;
  }
}

// ---------- venue pool ----------

function rowToNearbyPlace(row: VenuePoolRow): NearbyPlace {
  return {
    name: row.name,
    category: row.category,
    subtype: row.subtype ?? undefined,
    prominent: !!row.prominent,
    osmType: row.osm_type as 'node' | 'way' | 'relation',
    osmId: row.osm_id,
    lat: row.lat,
    lng: row.lng,
  };
}

// Upserts one discovered place into venue_pool, keyed by the durable
// (osm_type, osm_id) pair. An existing row only has its
// location/name/category/prominence refreshed — title/description/
// long_description, once set, are never touched here (see generateCopy
// call in populateVenuePool for the one place copy legitimately changes:
// upgrading a fresh insert's templated placeholder to Claude's copy).
// Handles losing a race against a concurrent insert for the same osm key
// (two nearby fetches discovering the same real place moments apart) by
// re-reading whichever row actually won, rather than erroring.
async function upsertVenuePlace(env: Env, place: NearbyPlace, now: number, variantIndex: number): Promise<{ row: VenuePoolRow; isNew: boolean }> {
  const existing = await env.DB.prepare('SELECT * FROM venue_pool WHERE osm_type = ? AND osm_id = ?').bind(place.osmType, place.osmId).first<VenuePoolRow>();
  if (existing) {
    await env.DB.prepare('UPDATE venue_pool SET name = ?, category = ?, subtype = ?, prominent = ?, lat = ?, lng = ?, last_seen_at = ? WHERE id = ?')
      .bind(place.name, place.category, place.subtype ?? null, place.prominent ? 1 : 0, place.lat, place.lng, now, existing.id)
      .run();
    return {
      row: { ...existing, name: place.name, category: place.category, subtype: place.subtype ?? null, prominent: place.prominent ? 1 : 0, lat: place.lat, lng: place.lng, last_seen_at: now },
      isNew: false,
    };
  }

  const copy = templatedCopy(place, variantIndex);
  const id = crypto.randomUUID();
  const row: VenuePoolRow = {
    id,
    osm_type: place.osmType,
    osm_id: place.osmId,
    name: place.name,
    category: place.category,
    subtype: place.subtype ?? null,
    prominent: place.prominent ? 1 : 0,
    lat: place.lat,
    lng: place.lng,
    title: copy.title,
    description: copy.desc,
    long_description: copy.longDesc,
    first_seen_at: now,
    last_seen_at: now,
  };
  try {
    await env.DB.prepare(
      `INSERT INTO venue_pool (id, osm_type, osm_id, name, category, subtype, prominent, lat, lng, title, description, long_description, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(row.id, row.osm_type, row.osm_id, row.name, row.category, row.subtype, row.prominent, row.lat, row.lng, row.title, row.description, row.long_description, row.first_seen_at, row.last_seen_at)
      .run();
    return { row, isNew: true };
  } catch (err) {
    const winner = await env.DB.prepare('SELECT * FROM venue_pool WHERE osm_type = ? AND osm_id = ?').bind(place.osmType, place.osmId).first<VenuePoolRow>();
    if (winner) return { row: winner, isNew: false };
    throw err;
  }
}

// The expensive path — replaces the old per-region generateBatch. Fetches
// both tiers from Overpass (see places.ts) and upserts every discovered
// place into the shared venue_pool, weekly-tier first so a place
// qualifying for both tag sets keeps its weekly identity (same rule the
// old generateBatch enforced via weeklyNames filtering). Returns whether
// anything at all was found, for recordFetchCoverage's TTL choice.
async function populateVenuePool(env: Env, lat: number, lng: number): Promise<boolean> {
  const weeklyPlaces = await fetchNearbyPlaces(lat, lng, POOL_WEEKLY_RADII, POOL_WEEKLY_LANDMARK_RADIUS_M);
  // Sequenced after the weekly fetch, not run alongside it — fetchNearbyPlaces
  // already fires 2 concurrent Overpass requests (close+landmark); a 3rd
  // concurrent one was observed getting HTTP 429'd by Overpass's shared
  // public instance during testing even though close+landmark succeeded.
  const weeklyNaturePlaces = await fetchNaturePlaces(lat, lng, POOL_WEEKLY_LANDMARK_RADIUS_M, 'park');
  const destinationPlaces = await fetchDestinationPlaces(lat, lng, POOL_MONTHLY_RADIUS_M);
  const monthlyNaturePlaces = await fetchNaturePlaces(lat, lng, POOL_MONTHLY_RADIUS_M, 'destination');

  const now = Date.now();
  const categorySeen = new Map<PlaceCategory, number>();
  const seenOsmKeys = new Set<string>();
  const newlyInserted: VenuePoolRow[] = [];
  let foundAny = false;

  for (const place of [...weeklyPlaces, ...weeklyNaturePlaces, ...destinationPlaces, ...monthlyNaturePlaces]) {
    const key = `${place.osmType}:${place.osmId}`;
    if (seenOsmKeys.has(key)) continue;
    seenOsmKeys.add(key);
    foundAny = true;

    const variantIndex = categorySeen.get(place.category) ?? 0;
    categorySeen.set(place.category, variantIndex + 1);
    const { row, isNew } = await upsertVenuePlace(env, place, now, variantIndex);
    if (isNew) newlyInserted.push(row);
  }

  if (newlyInserted.length > 0) {
    const copy = await generateCopy(env, newlyInserted.map(rowToNearbyPlace));
    await env.DB.batch(
      newlyInserted.map((row, i) =>
        env.DB.prepare('UPDATE venue_pool SET title = ?, description = ?, long_description = ? WHERE id = ?').bind(copy[i].title, copy[i].desc, copy[i].longDesc, row.id)
      )
    );
  }

  return foundAny;
}

// ---------- fetch throttle (decoupled from eligibility radius) ----------

// ~0.5 degree bands (~55km at these latitudes) — purely an index prefilter
// for "have we scanned anywhere near here recently," never used for
// eligibility. Boundary jitter here is harmless (worst case: one redundant
// concurrent fetch); jitter across a tight *eligibility* boundary was the
// actual grid-cell bug this whole redesign replaces.
function fetchBucket(lat: number, lng: number): { latBucket: number; lngBucket: number } {
  return { latBucket: Math.floor(lat * 2), lngBucket: Math.floor(lng * 2) };
}

// Sits comfortably above the 8km weekly radius (so weekly-triggered jitter
// can't cause spurious re-fetches) and comfortably below the 45km monthly
// radius — a fetch centered within this distance of the user has already
// scanned out to POOL_MONTHLY_RADIUS_M from its own origin, so it very
// likely already covers most of what's near the user too.
const FETCH_COVERAGE_RADIUS_M = 20_000;
// Real venues don't move — a positive fetch stays trusted far longer than
// the old 7-day region cache. A fetch that found nothing gets rechecked
// soon, mirroring the old EMPTY_NEGATIVE_CACHE_SECONDS reasoning: a
// transient Overpass hiccup shouldn't lock an area out for long.
const POOL_FETCH_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const EMPTY_POOL_FETCH_TTL_MS = 60 * 60 * 1000;
const FETCH_LOCK_SECONDS = 60;
const FETCH_POLL_INTERVAL_MS = 2000;
const FETCH_POLL_MAX_ATTEMPTS = 10;

async function hasRecentPoolCoverage(env: Env, lat: number, lng: number): Promise<boolean> {
  const { latBucket, lngBucket } = fetchBucket(lat, lng);
  const { results } = await env.DB.prepare(
    'SELECT lat, lng FROM place_fetch_log WHERE lat_bucket BETWEEN ? AND ? AND lng_bucket BETWEEN ? AND ? AND expires_at > ?'
  )
    .bind(latBucket - 1, latBucket + 1, lngBucket - 1, lngBucket + 1, Date.now())
    .all<{ lat: number; lng: number }>();
  return (results ?? []).some((r) => haversineMeters(lat, lng, r.lat, r.lng) <= FETCH_COVERAGE_RADIUS_M);
}

async function recordFetchCoverage(env: Env, lat: number, lng: number, foundAny: boolean): Promise<void> {
  const { latBucket, lngBucket } = fetchBucket(lat, lng);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO place_fetch_log (id, lat, lng, lat_bucket, lng_bucket, found_any, fetched_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), lat, lng, latBucket, lngBucket, foundAny ? 1 : 0, now, now + (foundAny ? POOL_FETCH_TTL_MS : EMPTY_POOL_FETCH_TTL_MS))
    .run();
}

// Polls for coverage a concurrent in-flight populateVenuePool call is
// expected to produce. Stops early, without waiting out the full window,
// as soon as the fetch lock is gone — that means the other request already
// finished (successfully or not), so there's nothing left to wait for.
async function waitForInFlightPoolFetch(env: Env, lat: number, lng: number): Promise<void> {
  const { latBucket, lngBucket } = fetchBucket(lat, lng);
  const lockKey = `pool-fetch-generating:${latBucket}:${lngBucket}`;
  for (let attempt = 0; attempt < FETCH_POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(FETCH_POLL_INTERVAL_MS);
    if (await hasRecentPoolCoverage(env, lat, lng)) return;
    const stillFetching = await env.RATE_LIMIT.get(lockKey);
    if (!stillFetching) return;
  }
}

// ---------- selection ----------

// Bounding-box prefilter (against the category+lat index) then an exact
// haversine filter in application code — no spatial extension needed at
// this app's data volume. Deliberately no distance sort: ranking is by
// prominence only (see selectVenuesForCategory), not by "nearest first,"
// so two users at different distances from the same standout venue still
// converge on it.
async function findEligibleVenues(env: Env, lat: number, lng: number, category: PlaceCategory, radiusMeters: number): Promise<VenuePoolRow[]> {
  const latDeltaDeg = radiusMeters / 111_320;
  const lngDeltaDeg = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  const { results } = await env.DB.prepare('SELECT * FROM venue_pool WHERE category = ? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?')
    .bind(category, lat - latDeltaDeg, lat + latDeltaDeg, lng - lngDeltaDeg, lng + lngDeltaDeg)
    .all<VenuePoolRow>();
  return (results ?? []).filter((row) => haversineMeters(lat, lng, row.lat, row.lng) <= radiusMeters);
}

// FNV-1a hash — same algorithm already used client-side (src/lib/store.ts's
// hashStr) for its own seeded shuffle, independently implemented here.
// Deterministic, no shared state: two Worker isolates compute the same
// value for the same input every time.
function rotationScore(venueId: string, periodKey: string, category: string): number {
  const s = `${venueId}:${periodKey}:${category}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// The single most-prominent eligible venue (`primary`) is always selected,
// unconditionally, and never rotates — this is the load-bearing guarantee
// that makes two users converge on the same challenge: if a venue is each
// of their #1 by prominence, both get it, forever, by construction (this
// is what makes the "two nearby towns share a landmark" case work). The
// remaining slots rotate by period via a per-venue deterministic hash, so
// there's still week-to-week/month-to-month variety — convergent on those
// slots too whenever both users' full top-K agree, best-effort otherwise.
function selectVenuesForCategory(eligible: VenuePoolRow[], periodKey: string, category: string, slots: number): VenuePoolRow[] {
  const ranked = [...eligible].sort((a, b) => b.prominent - a.prominent || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const candidates = ranked.slice(0, SELECTION_TOP_K);
  if (candidates.length === 0) return [];

  const [primary, ...rest] = candidates;
  const rotationPicks = [...rest].sort((a, b) => rotationScore(b.id, periodKey, category) - rotationScore(a.id, periodKey, category)).slice(0, slots - 1);
  return [primary, ...rotationPicks];
}

// Turns a selected pool venue into the user-facing row for this period —
// the first caller (of potentially many nearby users) to select a given
// venue for a given period creates the row; every subsequent one just
// resolves the same one via the (venue_id, period_key) unique index. Never
// returns the locally-built row directly on the insert path — always
// re-SELECTs afterward, since a request that loses the race would
// otherwise hand back an id that was never actually persisted.
async function materializeChallenge(env: Env, venue: VenuePoolRow, periodKey: string): Promise<LocalChallengeRow> {
  const profile = CATEGORY_PROFILE[venue.category];
  const regionKey = bucketRegionKey(venue.lat, venue.lng);
  const id = crypto.randomUUID();
  const createdAt = Date.now();

  try {
    await env.DB.prepare(
      `INSERT INTO local_challenges (id, region_key, venue_id, period_key, place_name, place_category, place_lat, place_lng, title, description, long_description, cadence, verify_type, tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, regionKey, venue.id, periodKey, venue.name, venue.category, venue.lat, venue.lng, venue.title, venue.description, venue.long_description, profile.cadence, 'photo', profile.tokens, createdAt)
      .run();
  } catch {
    // Lost a race against a concurrent materialization for the same
    // (venue_id, period_key) — expected under normal traffic when two
    // nearby users' requests overlap, not an error.
  }

  const row = await env.DB.prepare('SELECT * FROM local_challenges WHERE venue_id = ? AND period_key = ?').bind(venue.id, periodKey).first<LocalChallengeRow>();
  if (!row) throw new Error(`local-challenges: materialization for venue ${venue.id} period ${periodKey} produced no row`);
  return row;
}

// Shared response builder for every return path below — resolves a
// per-venue image for each row (falling back to the region's shared image
// when a venue has none of its own) alongside the challenge batch. Skipped
// entirely when there are no challenges to decorate, so an empty result
// never pays for a reverse-geocode/Wikipedia/Commons lookup.
//
// Two different real places should never show the identical photo in one
// batch — the dedup pass below means a later row that would repeat an
// already-claimed image goes without one instead of a misleadingly
// duplicated one. Keyed by venue_id (falling back to the row's own id for
// legacy pre-migration rows) rather than the row id directly — under the
// new model the same venue can recur across periods, and its Commons
// image lookup shouldn't be redone from scratch every single period.
async function respondWithChallenges(env: Env, regionKey: string, lat: number, lng: number, rows: LocalChallengeRow[]): Promise<Response> {
  if (rows.length === 0) return json({ challenges: [], cityImage: null });
  const cityImage = await getCityImageForRegion(env, regionKey, lat, lng);
  const venueImages = await Promise.all(rows.map((row) => getVenueImage(env, row.venue_id ?? row.id, row.place_lat, row.place_lng)));

  const usedImages = new Set<string>();
  const challenges = rows.map((row, i) => {
    const candidate = venueImages[i] ?? cityImage;
    const bgImage = candidate && !usedImages.has(candidate) ? candidate : null;
    if (bgImage) usedImages.add(bgImage);
    return toClientChallenge(row, bgImage);
  });
  return json({ challenges, cityImage });
}

export async function handleGetLocalChallenges(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  // Loose overall safety net — mostly cheap D1 reads/writes on the common
  // path now, present to satisfy "rate-limit everything," not a real
  // constraint on normal use.
  if (!(await checkRateLimit(env, `local-challenges:${auth.id}`, 120, 3600))) {
    return error('Too many requests. Try again later.', 429);
  }

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return error('Invalid lat/lng');
  }

  // Only path that costs money (Overpass + Claude) — gated behind the
  // strict per-user limit, checked *after* the coverage/lock checks so a
  // request that was always going to skip fetching (coverage already
  // warm, or another request already fetching) doesn't burn a daily
  // attempt for nothing — the same ordering lesson learned the hard way
  // with the old region-based rate limit.
  if (!(await hasRecentPoolCoverage(env, lat, lng))) {
    const { latBucket, lngBucket } = fetchBucket(lat, lng);
    const lockKey = `pool-fetch-generating:${latBucket}:${lngBucket}`;
    const alreadyFetching = await env.RATE_LIMIT.get(lockKey);

    if (alreadyFetching) {
      console.error(`local-challenges: pool fetch already in flight near ${latBucket}:${lngBucket}, waiting for it`);
      await waitForInFlightPoolFetch(env, lat, lng);
    } else {
      const canFetch = await checkRateLimit(env, `local-challenges-fetch:${auth.id}`, 5, 86400);
      if (!canFetch) {
        console.error(`local-challenges: pool fetch rate-limited for user ${auth.id}`);
      } else {
        await env.RATE_LIMIT.put(lockKey, '1', { expirationTtl: FETCH_LOCK_SECONDS });
        const foundAny = await populateVenuePool(env, lat, lng);
        await recordFetchCoverage(env, lat, lng, foundAny);
      }
    }
  }

  const weeklyPeriodKey = computePeriodKey('weekly');
  const monthlyPeriodKey = computePeriodKey('monthly');
  const rows: LocalChallengeRow[] = [];

  for (const category of WEEKLY_CATEGORIES) {
    const eligible = await findEligibleVenues(env, lat, lng, category, POOL_WEEKLY_LANDMARK_RADIUS_M);
    const selected = selectVenuesForCategory(eligible, weeklyPeriodKey, category, VENUES_PER_CATEGORY);
    for (const venue of selected) rows.push(await materializeChallenge(env, venue, weeklyPeriodKey));
  }

  const monthlyEligible = await findEligibleVenues(env, lat, lng, 'destination', POOL_MONTHLY_RADIUS_M);
  const monthlySelected = selectVenuesForCategory(monthlyEligible, monthlyPeriodKey, 'destination', DESTINATION_VENUES_LIMIT);
  for (const venue of monthlySelected) rows.push(await materializeChallenge(env, venue, monthlyPeriodKey));

  return respondWithChallenges(env, bucketRegionKey(lat, lng), lat, lng, rows);
}
