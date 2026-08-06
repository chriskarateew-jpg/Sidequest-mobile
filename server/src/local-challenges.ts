// Gumpa — location-flavored challenges tied to real nearby places.
// GET /local-challenges turns a coarse lat/lng into a cached batch of
// real-venue tasks: on a region cache miss, pulls nearby places from
// OpenStreetMap (places.ts) and has Claude write short on-brand copy for
// each, then caches the batch in D1 keyed by region so most requests never
// touch Overpass or Anthropic at all. Rows are immutable — regenerating a
// region inserts a fresh batch rather than overwriting, so an id already
// handed to a client stays resolvable (see complete.ts's fallback lookup)
// for the rest of whatever period it was suggested in.

import { requireAuth } from './auth';
import { getCityImageForRegion } from './city-image';
import type { Env } from './env';
import { error, json } from './http';
import { fetchNearbyPlaces, type NearbyPlace, type PlaceCategory } from './places';
import { checkRateLimit } from './ratelimit';

const MODEL = 'claude-haiku-4-5-20251001';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — a batch mixes weekly- and monthly-cadence rows, but this only governs how often the region's *suggestion pool* is refreshed, not how long an already-handed-out id stays completable
const EMPTY_NEGATIVE_CACHE_SECONDS = 60 * 60; // short on purpose — a transient Overpass hiccup or a since-widened radius shouldn't lock a region out of ever trying again for a full day
const MAX_TITLE_LENGTH = 60;
const MAX_DESC_LENGTH = 140;
const VENUES_PER_CATEGORY = 2;
const MAX_VENUES_PER_BATCH = 8;

// All venue categories land on the weekly slate — a single sit-down visit,
// same as the rest of the weekly-explore entries. Landmarks (museums,
// monuments, viewpoints) take more effort than a coffee run, so they carry a
// higher reward within that same cadence (matches the static w-tourist
// reward) rather than being bumped up to monthly — monthly only ever shows
// one card (see pickSuggestions in store.ts), and a local pick there was
// crowding out the static monthly slate instead of adding to the weekly one.
const CATEGORY_PROFILE: Record<PlaceCategory, { cadence: 'weekly' | 'monthly'; tokens: number }> = {
  park: { cadence: 'weekly', tokens: 60 },
  cafe: { cadence: 'weekly', tokens: 60 },
  restaurant: { cadence: 'weekly', tokens: 60 },
  landmark: { cadence: 'weekly', tokens: 75 },
};

export interface LocalChallengeRow {
  id: string;
  region_key: string;
  place_name: string;
  place_category: string;
  place_lat: number;
  place_lng: number;
  title: string;
  description: string;
  cadence: string;
  verify_type: string;
  tokens: number;
  created_at: number;
}

// Rounding to 2 decimal places is a ~1km grid cell at US latitudes — coarse
// enough that nearby users/visits share a cache entry, fine enough to still
// feel genuinely local. Computed here only, from the request's own lat/lng —
// never trust a client-supplied region key.
function bucketRegionKey(lat: number, lng: number): string {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return `${round2(lat).toFixed(2)},${round2(lng).toFixed(2)}`;
}

function toClientChallenge(row: LocalChallengeRow) {
  // Always 'camera' — a local challenge is a real-venue visit by
  // construction, never a screenshot task (see ProofType in tokens.ts).
  return { id: row.id, cadence: row.cadence, tokens: row.tokens, title: row.title, desc: row.description, verify: row.verify_type, proofType: 'camera' as const };
}

async function loadBatch(env: Env, regionKey: string, freshOnly: boolean): Promise<LocalChallengeRow[] | null> {
  const latest = await env.DB.prepare('SELECT MAX(created_at) as maxCreated FROM local_challenges WHERE region_key = ?')
    .bind(regionKey)
    .first<{ maxCreated: number | null }>();
  if (!latest?.maxCreated) return null;
  if (freshOnly && latest.maxCreated < Date.now() - CACHE_TTL_MS) return null;

  const { results } = await env.DB.prepare('SELECT * FROM local_challenges WHERE region_key = ? AND created_at = ?')
    .bind(regionKey, latest.maxCreated)
    .all<LocalChallengeRow>();
  return results && results.length > 0 ? results : null;
}

export async function getLocalChallengeById(env: Env, id: string): Promise<LocalChallengeRow | null> {
  return env.DB.prepare('SELECT * FROM local_challenges WHERE id = ?').bind(id).first<LocalChallengeRow>();
}

// Up to VENUES_PER_CATEGORY per category so one common category (cafes,
// restaurants) can't crowd out rarer ones (parks, landmarks) in the batch —
// places.ts already guarantees the raw fetch itself is category-balanced.
function pickDiverseVenues(places: NearbyPlace[]): NearbyPlace[] {
  const byCategory = new Map<PlaceCategory, NearbyPlace[]>();
  for (const p of places) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p]);

  const picked: NearbyPlace[] = [];
  for (const list of byCategory.values()) picked.push(...list.slice(0, VENUES_PER_CATEGORY));
  return picked.slice(0, MAX_VENUES_PER_BATCH);
}

function buildCopyPrompt(venues: NearbyPlace[]): string {
  return [
    'You write short, upbeat challenge copy for a personal-growth app called Gumpa.',
    'For each real place below, write a task title (imperative, under 8 words, e.g. "Run a loop through Depot Park")',
    'and a one-sentence description (under 20 words) nudging the user to actually go visit it.',
    '',
    'Ground the title and description in something specific and genuinely known about that named place —',
    'a signature dish or drink, a distinctive feature, what it\'s actually known for locally — using your own',
    'knowledge of it. Never fall back to describing the category instead of the place: "Explore SoHo\'s streets',
    'and architecture" is a category-level cop-out for a neighborhood; something like "Photograph a cast-iron',
    'facade on Greene Street" names an actual, specific thing to go do. If you genuinely have nothing specific',
    'for a given place, write the most concrete plausible action for that category rather than a vague nudge',
    '("look around", "explore", "check it out").',
    '',
    'Only state facts you are confident are well-established and still true — do not invent hours, prices, or',
    'specifics you are unsure of, and skip unverifiable superlatives ("the best", "world-famous").',
    '',
    'Never use em dashes (—). Use a period, comma, or colon instead.',
    '',
    'Places:',
    ...venues.map((v, i) => `${i + 1}. ${v.name} (${v.category})`),
    '',
    `Respond with ONLY minified JSON, no other text: an array of exactly ${venues.length} objects in the same order: [{"title":"...","desc":"..."}]`,
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

const CATEGORY_VERB: Record<PlaceCategory, string> = {
  park: 'Take a walk through',
  cafe: 'Grab a coffee at',
  restaurant: 'Grab a bite at',
  landmark: 'Go visit',
};

// Plain, non-LLM copy for a single venue — never fails, never needs a
// network call. Used to fill in for Claude on a per-venue basis (see
// generateCopy) so a model hiccup degrades to "correct but generic" instead
// of losing the venue (or the whole batch) entirely.
function templatedCopy(venue: NearbyPlace): { title: string; desc: string } {
  const title = normalizeCopy(`${CATEGORY_VERB[venue.category]} ${venue.name}`, MAX_TITLE_LENGTH) ?? venue.name.slice(0, MAX_TITLE_LENGTH);
  return { title, desc: `A nearby ${venue.category} worth going to see in person.` };
}

// One Claude call per batch (not per venue) — and Claude's job is copy only.
// Cadence/verify/tokens are always assigned by us below, never by the
// model, so a bad generation can't produce structurally weird challenges.
// Always returns exactly venues.length entries: Claude's copy is layered
// over a fully-templated fallback per venue, so a bad/missing model
// response for one venue (or all of them, or Claude being unreachable)
// degrades to plain-but-correct copy instead of losing the entire batch —
// this used to fail all-or-nothing, which meant one malformed item (or one
// off-by-one from the model) silently zeroed out every venue in the batch
// with nothing logged anywhere to explain why.
async function generateCopy(env: Env, venues: NearbyPlace[]): Promise<{ title: string; desc: string }[]> {
  const fallback = venues.map(templatedCopy);

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
      return { title, desc };
    });
  } catch (err) {
    console.error('local-challenges: JSON.parse failed on Claude response, using templated copy', err);
    return fallback;
  }
}

async function generateBatch(env: Env, regionKey: string, lat: number, lng: number): Promise<LocalChallengeRow[] | null> {
  const places = await fetchNearbyPlaces(lat, lng);
  if (places.length === 0) {
    console.error(`local-challenges: no Overpass places for region ${regionKey}`);
    return null;
  }

  const venues = pickDiverseVenues(places);
  if (venues.length === 0) return null;

  const copy = await generateCopy(env, venues);

  const createdAt = Date.now();
  const rows: LocalChallengeRow[] = venues.map((venue, i) => {
    const profile = CATEGORY_PROFILE[venue.category];
    return {
      id: crypto.randomUUID(),
      region_key: regionKey,
      place_name: venue.name,
      place_category: venue.category,
      place_lat: venue.lat,
      place_lng: venue.lng,
      title: copy[i].title,
      description: copy[i].desc,
      cadence: profile.cadence,
      verify_type: 'photo',
      tokens: profile.tokens,
      created_at: createdAt,
    };
  });

  await env.DB.batch(
    rows.map((r) =>
      env.DB.prepare(
        `INSERT INTO local_challenges (id, region_key, place_name, place_category, place_lat, place_lng, title, description, cadence, verify_type, tokens, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(r.id, r.region_key, r.place_name, r.place_category, r.place_lat, r.place_lng, r.title, r.description, r.cadence, r.verify_type, r.tokens, r.created_at)
    )
  );

  return rows;
}

// Shared response builder for every return path below — attaches the
// region's cached background image (see city-image.ts) alongside the
// challenge batch. Skipped entirely when there are no challenges to
// decorate, so an empty result never pays for a reverse-geocode/Wikipedia
// lookup.
async function respondWithChallenges(env: Env, regionKey: string, lat: number, lng: number, rows: LocalChallengeRow[]): Promise<Response> {
  if (rows.length === 0) return json({ challenges: [], cityImage: null });
  const cityImage = await getCityImageForRegion(env, regionKey, lat, lng);
  return json({ challenges: rows.map(toClientChallenge), cityImage });
}

export async function handleGetLocalChallenges(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  // Loose overall safety net — mostly cheap D1 reads on cache hits, present
  // to satisfy "rate-limit everything," not a real constraint on normal use.
  if (!(await checkRateLimit(env, `local-challenges:${auth.id}`, 120, 3600))) {
    return error('Too many requests. Try again later.', 429);
  }

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return error('Invalid lat/lng');
  }

  const regionKey = bucketRegionKey(lat, lng);

  const fresh = await loadBatch(env, regionKey, true);
  if (fresh) return respondWithChallenges(env, regionKey, lat, lng, fresh);

  // Cache miss/stale — the only path that costs money (Overpass + Claude),
  // so it's the only path gated behind the strict per-user limit. Every
  // failure mode below degrades to "serve stale or empty," never a hard
  // error — local challenges are supplementary, the static catalog always
  // works fully on its own.
  const canGenerate = await checkRateLimit(env, `local-challenges-gen:${auth.id}`, 5, 86400);
  const emptyCacheKey = `local-challenges-empty:${regionKey}`;
  const knownEmpty = canGenerate ? await env.RATE_LIMIT.get(emptyCacheKey) : null;

  if (!canGenerate) {
    console.error(`local-challenges: generation rate-limited for user ${auth.id}, region ${regionKey}`);
  } else if (knownEmpty) {
    console.error(`local-challenges: region ${regionKey} in empty negative-cache, skipping generation`);
  } else {
    const generated = await generateBatch(env, regionKey, lat, lng);
    if (generated && generated.length > 0) return respondWithChallenges(env, regionKey, lat, lng, generated);
    console.error(`local-challenges: generateBatch produced nothing for region ${regionKey}, caching empty for ${EMPTY_NEGATIVE_CACHE_SECONDS}s`);
    await env.RATE_LIMIT.put(emptyCacheKey, '1', { expirationTtl: EMPTY_NEGATIVE_CACHE_SECONDS });
  }

  const stale = await loadBatch(env, regionKey, false);
  if (!stale) console.error(`local-challenges: no stale batch to fall back to for region ${regionKey} — responding empty`);
  return respondWithChallenges(env, regionKey, lat, lng, stale ?? []);
}
