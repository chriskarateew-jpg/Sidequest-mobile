# Location-Based Weekly/Monthly Tasks — Implementation Prompt

Paste this whole file into a fresh Claude Code session in this repo to execute
the change. It's written as a self-contained brief: goal, current-state
citations, the concrete design, open decisions to confirm before coding, and
an ordered implementation checklist. Don't re-derive the architecture from
scratch — the file/line references below were verified against the current
codebase; spot-check them (things may have moved) but trust them as the
starting map.

## Goal

Today the weekly feed shows 3 challenges (1 guaranteed real-venue "local"
challenge + 2 from the static catalog) and the monthly feed shows 1 challenge
(always static — local challenges are deliberately excluded from monthly
today). Change this so that **all 3 weekly slots and the 1 monthly slot are
location-based (tied to a real, verifiable place with a GPS radius check)**,
falling back to the static catalog only when there genuinely aren't enough
real nearby venues. Daily stays exactly as it is today: 2 slots from the
static catalog.

## Why (for context, not something to re-litigate)

- **Fraud resistance**: a location-based task requires the submission photo's
  GPS fix to fall within a radius of the task's target coordinates
  (`server/src/complete.ts`'s `checkPhotoFraud`) — much harder to fake than a
  generic "do X" static task.
- **Engagement**: "go to this specific place and do this specific thing" is
  more compelling than a generic prompt.
- **Static catalog becomes curation-only**: with weekly/monthly no longer
  drawing primarily from the 40-entry static/dev-authored catalog
  (`dev_challenges` table), that catalog's role shrinks to daily tasks plus a
  fallback pool for weekly/monthly when local generation comes up short. The
  user (not this implementation) will manually trim the daily set down to
  "only the best" afterward, using the existing dev-panel/dashboard
  active-toggle UI — that's a content-curation step, not a coding task.

## Current state (verified against the codebase)

### Cadence & selection — client-side, `src/lib/store.ts`

`pickSuggestions` (`store.ts:165-178`) currently guarantees **at most one**
local (`isLocal`) challenge per cadence, only for weekly:

```ts
function pickSuggestions(cadence: Cadence, count: number, extra: Challenge[], custom: Challenge[]): Challenge[] {
  const pool = [...CHALLENGES, ...extra, ...custom].filter((c) => c.cadence === cadence);
  const shuffled = seededShuffle(pool, cadence + ':' + periodKeyFor(cadence));
  const picked = shuffled.slice(0, count);

  const localForCadence = extra.filter((c) => c.cadence === cadence);
  if (localForCadence.length > 0 && !picked.some((c) => c.isLocal)) {
    const guaranteed = seededShuffle(localForCadence, cadence + ':guaranteed:' + periodKeyFor(cadence))[0];
    if (picked.length < count) picked.push(guaranteed);
    else picked[picked.length - 1] = guaranteed;
  }
  return picked;
}
```

Called from `getSuggestions()` (`store.ts:337-343`):
`daily: pickSuggestions('daily', 2, local, custom)`,
`weekly: pickSuggestions('weekly', 3, local, custom)`,
`monthly: pickSuggestions('monthly', 1, local, custom)`. `local` =
`localChallenges` (fetched from `/local-challenges`), `custom` =
`customChallenges` (the full active `dev_challenges` set, since the static
`CHALLENGES` array in `src/lib/data.ts` is empty post-migration — see
`data.ts:42-53`).

### Location-based generation engine — `server/src/local-challenges.ts`

`GET /local-challenges` turns a rounded lat/lng into a cached, region-keyed
batch:

1. `bucketRegionKey` (lines 59-62) rounds to a ~1km grid.
2. Cache hit (`loadBatch`, 7-day TTL, `CACHE_TTL_MS`, line 19) → serve
   immediately, no external calls.
3. Cache miss → `fetchNearbyPlaces` (`server/src/places.ts`) queries
   OpenStreetMap's Overpass API: a "close" query (parks/cafes/restaurants,
   default `radiusMeters=2500`) and a separate "landmark" query
   (museums/monuments/viewpoints/attractions, default
   `landmarkRadiusMeters=5000`) — split into two requests on purpose, so a
   landmark-query timeout can't take the whole batch down
   (`places.ts:58-65`).
4. `pickDiverseVenues` caps at `VENUES_PER_CATEGORY = 2` per category,
   `MAX_VENUES_PER_BATCH = 8` total (lines 23-24, 90-97).
5. `generateCopy` (lines 175-226) makes **one** Anthropic call
   (`claude-haiku-4-5-20251001`) per batch to write title/desc for every
   venue, with a per-venue templated fallback (`templatedCopy`, lines
   156-163) if the model call fails or a specific item is malformed/generic
   (`mentionsVenue` check, lines 143-147).
6. `CATEGORY_PROFILE` (lines 33-38) currently assigns **every** category
   `cadence: 'weekly'`:
   ```ts
   const CATEGORY_PROFILE: Record<PlaceCategory, { cadence: 'weekly' | 'monthly'; tokens: number }> = {
     park: { cadence: 'weekly', tokens: 60 },
     cafe: { cadence: 'weekly', tokens: 60 },
     restaurant: { cadence: 'weekly', tokens: 60 },
     landmark: { cadence: 'weekly', tokens: 75 },
   };
   ```
   The type already allows `'monthly'` — it's just unused. The comment above
   it (lines 26-32) explains monthly was deliberately skipped because monthly
   only shows 1 card and a local pick there was "crowding out the static
   monthly slate" — that reasoning is exactly what this change reverses.
7. Rows are inserted into the `local_challenges` D1 table (schema:
   `server/migrations/0009_local_challenges.sql`) — `cadence` is already a
   column (`TEXT NOT NULL DEFAULT 'weekly'`), and the table comment even
   already anticipates this: *"a batch mixes weekly- and monthly-cadence
   rows"* (line 19 comment in `local-challenges.ts`). Rows are immutable;
   regenerating inserts a fresh batch rather than overwriting.

Rate limits: `local-challenges:${auth.id}` 120/hr (cheap, mostly cache-hit
reads), `local-challenges-gen:${auth.id}` 5/day (the expensive
Overpass+Anthropic path), plus a 1-hour empty-region negative cache
(`EMPTY_NEGATIVE_CACHE_SECONDS`, line 20).

### Images — currently one per region, not per venue

`server/src/city-image.ts` resolves **one background image per region**
(reverse-geocode → Wikipedia lead image, falling back to a Wikimedia Commons
geosearch centered on the request lat/lng), cached forever on success / 30
days on failure in the `city_images` table (`server/migrations/0010_city_images.sql`,
keyed by `region_key` only — no per-venue row). `respondWithChallenges`
(`local-challenges.ts:271-280`) attaches this **single shared image** to
every challenge in the batch. Client-side, `src/lib/local-challenges.ts`
copies that one `cityImage` onto every challenge's `bgImage` field
(`Challenge.bgImage`, `src/lib/data.ts:38`) — so today all local challenges
from the same region/batch show the identical skyline photo.

### GPS radius check — already generic, no change needed here

`server/src/complete.ts`'s `checkPhotoFraud` (lines 148-159) already checks
any catalog entry with `placeLat`/`placeLng` set (regardless of cadence or
source table) against `LOCAL_DISTANCE_THRESHOLD_METERS = 805` meters (line
104) or a per-row `radiusMeters` override, using `haversineMeters`
(`server/src/geo.ts:12-19`). Since `local_challenges.place_lat`/`place_lng`
are `NOT NULL` columns, every local challenge already gets this check today —
**this part requires no changes**, monthly local challenges get it for free.

### Static catalog — `dev_challenges` table, 40 rows

15 daily / 17 weekly / 8 monthly, none currently location-tagged (though the
schema supports it — `place_lat`/`place_lng`/`radius_meters` were added by
`server/migrations/0018_dev_challenge_locations.sql`, validated by
`server/src/location-fields.ts`, and both authoring UIs
(`src/app/dev-challenge-form.tsx`'s `LocationPickerMap`,
`dashboard/src/pages/TaskForm.tsx`'s lat/lng/radius fields) already support
setting them per-task).

## Target design

### 1. Extend `CATEGORY_PROFILE` with a monthly "destination" tier

Add a wider-radius query tier for monthly, reusing the existing
landmark/attraction OSM tags but at a genuinely "day trip" distance rather
than the current 5km landmark radius — 5km is still "same town," and
`docs/challenge-writing-guide.md`'s cadence test already defines monthly as
*"a day trip to another town... signing up for a course, finishing a 5K"*
(lines 52-64).

Recommended approach: add a third Overpass query tier in `places.ts`
(`buildDestinationQuery`, modeled on `buildLandmarkQuery`) at a much wider
radius (suggest 20-40km — **open decision, see below**), reusing the same
`tourism`/`historic` tags, run as its own isolated request (same reasoning as
the landmark/close split: don't let a wide, expensive query timeout take
weekly generation down with it). Dedupe against venues already picked for
the landmark/weekly tier so the same place can't be assigned to both.

Update `CATEGORY_PROFILE` (or introduce a parallel `destination` category)
so these wider-radius results get `cadence: 'monthly'` and a higher token
reward (a real day trip is a bigger ask than a coffee run — suggest 150,
consistent with the existing token scale where weekly landmark is 75).

### 2. Guarantee full weekly/monthly slots from local challenges, with graceful fallback

Rewrite `pickSuggestions` in `src/lib/store.ts` (or add a cadence-aware
variant) so that for `weekly` and `monthly`, it fills as many slots as
possible from `localChallenges` matching that cadence first, then backfills
any remaining slots from the static/custom pool — instead of today's
"guarantee exactly one" behavior. This must degrade gracefully: a
low-POI-density (rural) region may return fewer than 3 weekly candidates or
zero monthly candidates, and the feed must never show an empty or
short-by-surprise section — backfill silently from static.

### 3. Per-venue images instead of one shared region image

Add per-venue image resolution so each local challenge (weekly or monthly)
gets its own distinct photo instead of sharing one regional skyline shot.
Suggested approach, reusing the existing `city-image.ts` machinery:

- Add a new cache table (e.g. `venue_images`, same shape as `city_images`
  but keyed by venue identity — e.g. a rounded lat/lng + name hash, or the
  `local_challenges.id` itself) with the same permanent-success /
  short-negative-TTL split `city-image.ts` already uses (see AGENTS.md's
  "Caching & failure handling" — a failed image lookup must **not** be
  cached forever, same rule that bit the NYC city-image case).
- For each venue, run a Wikimedia Commons geosearch centered on the venue's
  own `lat`/`lng` (small radius — a few hundred meters, not the region's
  Wikipedia-lead-image path, which is keyed by place *name* and appropriate
  for a whole city but not a single cafe or park).
- Fall back to the existing region-level `city-image.ts` result if no
  venue-specific photo is found, so a venue never ends up with no image at
  all.
- This multiplies external image-lookup calls from ~1/region/week to
  ~1/venue/batch (up to 8 weekly + a few monthly venues) — flag this
  increase explicitly (see "Live-Volume follow-up" below); Wikimedia/Nominatim
  are free, unauthenticated, and shared across every Cloudflare Worker, not
  just this app.
- No client-side change needed for rendering: `Challenge.bgImage` is already
  a per-challenge field (`data.ts:38`) and `challenge-card.tsx` already
  renders it per-card — only the *value* assigned per challenge changes,
  from "the batch's shared image" to "this venue's own image."

### 4. Cache TTL for monthly

The existing 7-day `CACHE_TTL_MS` governs when a region's *suggestion pool*
refreshes, not how long an already-served id stays completable (rows are
immutable). A monthly task rotating on a 7-day suggestion refresh while the
user has a full month to complete it is probably fine as-is (only the
*next* suggestion changes, not the assigned one) — but confirm this against
`periodKeyFor('monthly')` semantics in `store.ts` before assuming; if the
monthly slot should feel more stable/less frequently changing than weekly,
consider a separate longer TTL for monthly-eligible batches specifically.

### 5. Generation rate limits

`local-challenges-gen` is 5/day per user today, covering the entire
Overpass+Anthropic generation path. Decide whether monthly (destination-tier)
generation should share this budget or get its own — sharing is simpler and
probably fine given generation is already rare (7-day cache means most users
almost never hit this path), but note the decision explicitly rather than
leaving it implicit.

## Open decisions to confirm before/while implementing

These are genuine judgment calls, not facts derivable from the code — pick
sensible defaults and flag them in the PR/commit rather than silently
guessing, per this being a solo project that still deserves explicit
tradeoffs written down:

1. **Monthly destination radius.** Suggested 20-40km — needs real testing
   against Overpass in both dense (NYC) and sparse (rural) regions to check
   for query timeouts and result quality, per `places.ts`'s own documented
   experience that wide radii in dense areas can blow the 25s Overpass
   timeout.
2. **Monthly cache TTL** — reuse the 7-day weekly TTL, or give monthly
   batches a longer/separate TTL.
3. **Whether existing static weekly/monthly `dev_challenges` rows should be
   bulk-deactivated** as part of this change, or left active as the fallback
   pool (recommended: leave them active as fallback — deactivating removes
   the safety net for sparse regions).
4. **Destination-tier copy tone** — `buildCopyPrompt` in
   `local-challenges.ts` could stay cadence-agnostic, or get a monthly-aware
   variant ("plan a half-day visit" vs. weekly's "swing by") — decide whether
   the extra prompt complexity is worth it or whether the existing copy
   style reads fine at day-trip scale too.

## Implementation order

1. `server/src/places.ts` — add the wider-radius destination query
   (`buildDestinationQuery`), isolated from the existing close/landmark
   queries per the established pattern (own request, own failure isolation).
2. `server/src/local-challenges.ts` — wire the new query into
   `fetchNearbyPlaces` (or add a parallel `fetchDestinationPlaces`), extend
   `CATEGORY_PROFILE`/venue picking so destination-tier venues get
   `cadence: 'monthly'`, dedupe against landmark picks, adjust
   `MAX_VENUES_PER_BATCH` if needed to leave room for both tiers.
3. Add per-venue image resolution (new module or extend `city-image.ts`) +
   new D1 migration for the `venue_images` cache table. Wire into
   `respondWithChallenges` so each challenge gets its own image instead of
   the shared regional one, with fallback to the regional image.
4. `src/lib/store.ts` — rewrite `pickSuggestions` (or the weekly/monthly call
   sites) to prefer filling all weekly/monthly slots from `localChallenges`
   before falling back to static/custom, per cadence.
5. `docs/challenge-writing-guide.md` — update test 4's framing (weekly/
   monthly are now expected to be location-based by default, not just
   allowed to be); rewrite the line saying local challenges are "exempt"
   from the five-test review (line 12) since they're becoming the default
   path, not a supplement; add a short section documenting the
   `placeLat`/`placeLng`/`radiusMeters` fields since neither authoring UI's
   location support is currently documented there at all.
6. Manually trim the static catalog via the existing dashboard/dev-panel
   active toggle (user's own follow-up, not code).

## Testing checklist

- Use the `run-gumpa-mobile` skill to drive the app and visually confirm:
  weekly section shows 3 real-venue tasks with 3 *different* images; monthly
  section shows 1 destination task with its own image (not the weekly
  region's shared skyline).
- Test a dense region (e.g. a major city) and a sparse region (rural
  coordinates with few/no OSM landmarks) — confirm the sparse case falls
  back to static tasks for whichever slots don't have enough local
  candidates, without an empty section or a crash.
- Submit a photo from outside a location task's radius and confirm the
  existing `location_mismatch` rejection in `complete.ts` still fires
  correctly for both weekly and the new monthly destination tasks.
- Confirm Overpass destination query latency/timeout behavior in a dense
  region at whatever radius is chosen (open decision #1).

## Live-Volume follow-up

This change measurably increases outbound API call volume per region-batch
generation: an extra Overpass query tier (destination), and per-venue image
lookups (Wikimedia/Nominatim) instead of one per region. Per
`docs/live-volume-audit-prompt.md`, re-run that audit after this ships to
re-check step 2 (outbound API volume/cost) and step 6 (photo/media handling)
against the new call pattern, and reconcile `docs/live-volume-checklist.md`
if any new recommendation falls out of it.
