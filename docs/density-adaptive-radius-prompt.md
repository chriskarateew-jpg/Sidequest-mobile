# Density-adaptive search radii for local challenges

Paste this whole file into a fresh Claude Code session in this repo to
execute the change, same pattern as the two prompts before it
(`docs/location-based-tasks-prompt.md`, `docs/location-task-refresh-fix-prompt.md`).
Two phases, in priority order: a free fix that's already proven to catch a
real miss, then a measured, capped adaptive layer for genuine sparsity.
File/line references verified against the current codebase as of this
writing (2026-08-10).

## Why (confirmed with real data, not a guess)

Fixed search radii treat a dense city and a spread-out coastal town
identically, and that's wrong in both directions: a radius wide enough to
find something in a rural area returns an overwhelming, crowded pool in a
city; a radius tight enough to feel "local" in a city misses real, nameable
things that are only a few km out in a spread-out area.

This isn't theoretical. Debugging a real user report (tasks not updating
after traveling to a Florida coastal town), I queried Overpass directly for
their exact rounded location (`30.06,-81.41`) using the app's current tag
set and radii and got **zero results** at every tier (2.5km close, 5km
landmark, 30km destination) — see the investigation in this session's prior
turns. That looked like genuine sparsity. It wasn't: re-querying the same
point with a **wider radius** turned up a real, named park — **Willowcove
Playground**, 4.6km out — that the app's current close-query (2.5km) simply
couldn't reach. It's not tourism/historic-tagged either, so the 5km
landmark tier (which only searches those tags) wouldn't have caught it at
any radius. It fell through a real gap between two tiers that don't
overlap in *what* they search, not just *how far*.

Meanwhile cafes/restaurants genuinely came up empty even at a broadened
5km/wider tag test — so the fix isn't "just widen everything," it's
"different categories are sparse by different amounts in the same spot,"
which is exactly the density-adaptive behavior being asked for.

## Current state (verified)

`server/src/places.ts`:

- `buildCloseQuery(lat, lng, radiusMeters)` (lines 38-56) — **one shared
  radius** for all three close categories (park/nature_reserve/garden,
  cafe, restaurant), each still its own `out center N;` block within a
  single combined request, default `radiusMeters = 2500` (line 173, via
  `fetchNearbyPlaces`'s default param).
- `buildLandmarkQuery` (lines 66-76) — tourism/historic tags only, default
  `landmarkRadiusMeters = 5000` (line 174).
- `buildDestinationQuery` (lines 85-95) — same tourism/historic tags,
  wider radius, default `radiusMeters = 30_000` (line 191, via
  `fetchDestinationPlaces`'s default param) — added earlier this session,
  chosen as a middle-of-the-suggested-range guess, not empirically tuned.
- `fetchNearbyPlaces` (lines 170-183) — runs close + landmark in parallel
  (`Promise.all`).
- `fetchDestinationPlaces` (lines 191-194) — runs sequentially *after*
  `fetchNearbyPlaces` in `local-challenges.ts`'s `generateBatch` (a fix from
  earlier this session, after a live test showed 3 concurrent Overpass
  requests getting one of them HTTP 429'd — see git history / this
  session's earlier turns).
- `categorize()` (lines 97-102) — leisure tag → `park`, `amenity=cafe` →
  `cafe`, `amenity=restaurant` → `restaurant`, else (tourism/historic) →
  `landmark`.
- Common case today: 3 total Overpass requests per generation event (close,
  landmark, destination) — generation itself is rare (7-day region cache +
  5/day/user rate limit in `local-challenges.ts`), so this budget has
  headroom.

## Phase 1: Per-category default radii (do this first — free)

Zero added requests, zero added latency, directly fixes the confirmed
Willowcove Playground gap. `buildCloseQuery` already emits 3 independent
Overpass query blocks in one HTTP request — Overpass QL allows a different
`around:radius,lat,lng` value per block within the same request, so
splitting the radius per category costs nothing extra.

### Changes

1. Replace `buildCloseQuery`'s single `radiusMeters` parameter with a
   per-category radius object:

   ```ts
   interface CloseRadii { park: number; cafe: number; restaurant: number }

   function buildCloseQuery(lat: number, lng: number, radii: CloseRadii): string {
     return `
   [out:json][timeout:25];
   (
     node["leisure"~"^(park|nature_reserve|garden)$"]["name"](around:${radii.park},${lat},${lng});
     way["leisure"~"^(park|nature_reserve|garden)$"]["name"](around:${radii.park},${lat},${lng});
   );
   out center ${PER_CATEGORY_LIMIT};
   (
     node["amenity"="cafe"]["name"](around:${radii.cafe},${lat},${lng});
   );
   out center ${PER_CATEGORY_LIMIT};
   (
     node["amenity"="restaurant"]["name"](around:${radii.restaurant},${lat},${lng});
   );
   out center ${PER_CATEGORY_LIMIT};
   `.trim();
   }
   ```

2. New defaults (suggested — see open decisions):
   - `park: 6000` (6km, up from the shared 2500m) — parks are naturally
     sparser even in mixed-density areas, and this is the exact category
     that had the confirmed miss. A 6km park visit still reads as "local,"
     not a day trip.
   - `cafe: 2500`, `restaurant: 3000` — kept tight on purpose. A coffee run
     or dinner spot should still feel like "nearby," not a planned trip;
     these are also the categories most likely to actually be dense/close
     in a real town center, so widening them by default risks *worse*
     results in cities (more crowding, less "walkable" feel) for
     questionable benefit in rural spots (confirmed empty even at 5km in
     testing).
   - `landmark: 5000` — unchanged, wasn't implicated in the confirmed miss.
   - `destination: 30_000 → 45_000` (see open decision — 60km found real
     content in the Florida test, but the original 30km choice was
     specifically to respect Overpass's 25s timeout in **dense** areas,
     untested at a higher value; don't bump this past what's actually
     verified safe without dense-region testing first).

3. Update `fetchNearbyPlaces`'s signature (`places.ts:170-175`) to accept a
   `CloseRadii` object instead of one `radiusMeters` number, and update its
   one call site in `local-challenges.ts`'s `generateBatch` accordingly.

## Phase 2: Measured, capped adaptive widening (for genuine sparsity)

Phase 1 fixes the confirmed gap but won't help a category that's
genuinely sparse even at the new default (cafes/restaurants in the tested
Florida spot came up empty at 5km with a broadened tag set too). This
phase adds a bounded, single-step widen retry — deliberately **not** an
open-ended probe loop, to keep the worst-case cost predictable given how
unreliable Overpass has already proven to be this session (repeated
429s/504s/timeouts during ordinary testing volume).

### Design

- After the Phase-1 default-radius queries run (still exactly 3 requests:
  close, landmark, destination), check the hit count **per category** from
  the results already in hand — no extra request needed to know this.
- For any category that came back with **zero** hits, issue **exactly one**
  retry query for **just that category**, at a wider "widen" radius. Not
  compounding, not repeated — one shot, then accept the result either way.
- This requires each query builder to support building a query for a
  *subset* of categories (so a park-only retry doesn't also re-ask for
  cafes/restaurants that already succeeded) — a straightforward
  refactor of `buildCloseQuery` into per-category query fragments that get
  joined, rather than one fixed 3-block template.
- Suggested widen radii (one-shot, not a multiplier ladder — pick a value
  worth a single meaningful jump): `park: 15_000`, `cafe: 8_000`,
  `restaurant: 8_000`, `landmark: 12_000`, `destination: 60_000` (this last
  one is empirically justified — 60km is exactly what found real content
  in the Florida test after 30km/45km came up empty).
- Log every widen event (category, region, whether the retry found
  anything) — this is what makes the system actually *measured* rather
  than just guessed-then-forgotten: after this ships, real usage data
  tells you which categories/regions are widening often, which informs
  whether Phase 1's defaults need adjusting again, all without re-deriving
  it from a single manual test like this session's.

### Cost, quantified (asked for explicitly, answering precisely)

- **Dollar cost: none.** Overpass has no API key or billing.
- **Best/common case (dense area, e.g. NYC): unchanged, 3 requests.**
  Widening only fires on a zero-hit category, which won't happen in a
  dense area.
- **Worst case (fully sparse area, every category zero at default):** 3
  base requests + up to 5 one-shot widen retries (park, cafe, restaurant,
  landmark, destination) = **8 requests total**, still bounded and
  predictable — not an open-ended loop.
- **Reliability exposure:** the real cost isn't dollars, it's more
  sequential dependence on an already-flaky free public API, concentrated
  exactly in the sparse-region case that most needs to succeed. Mitigate
  by keeping retries to exactly one attempt per category (already
  specified above) rather than a compounding backoff — bounds the downside
  without chasing marginal gains from a 3rd or 4th widening attempt.
- **Claude/D1/KV cost: unaffected.** Copy generation is still one Claude
  call per batch regardless of how many Overpass requests ran to assemble
  the venue list feeding it. D1/KV costs are negligible either way (see
  `docs/Live-Volume.md`).

## Open decisions

1. **Phase 1's exact default values** (park 6km, cafe 2.5km, restaurant
   3km, destination 45km) are reasoned defaults, not lab-tested across many
   real regions. Recommend shipping them and watching real generation
   logs/costs rather than over-tuning from one data point (this Florida
   spot).
2. **Destination default bump (30km → 45km) needs dense-region validation**
   before locking in — the original 30km choice was specifically about not
   blowing Overpass's timeout in a tag-dense city; 45km hasn't been tested
   against NYC-scale density. Test this explicitly (see checklist) before
   shipping, or hold the destination default at 30km and only rely on
   Phase 2's widen-to-60km for sparse cases.
3. **Whether Phase 2 ships at all in this pass, or Phase 1 ships alone
   first** — given Phase 1 already fixes the confirmed bug for free, it's
   reasonable to ship it alone, observe real widen-worthy misses via
   Phase 2's logging groundwork later, and only build the retry mechanism
   once there's evidence Phase 1 alone isn't enough. Flagging as a genuine
   split point, not deciding it here.

## Implementation order

1. `server/src/places.ts` — Phase 1: per-category `CloseRadii` on
   `buildCloseQuery`, update `fetchNearbyPlaces`'s signature, bump/adjust
   defaults per above.
2. `server/src/local-challenges.ts` — update the one call site in
   `generateBatch` to pass the new radii shape.
3. If proceeding with Phase 2: refactor close/landmark/destination query
   builders to support per-category subset queries, add the zero-hit
   detection + one-shot widen retry in `generateBatch`, add widen-event
   logging.
4. Typecheck server workspace.

## Testing checklist

- Re-run the Florida test spot (`30.06,-81.41`) end-to-end through the real
  `/local-challenges` endpoint (not a manual Overpass query) and confirm
  Willowcove Playground (or an equivalent nearby park) now surfaces via
  Phase 1 alone, without needing Phase 2.
- Dense-region check for the destination default bump (open decision #2):
  hit a real NYC-area coordinate at the new 45km destination default and
  confirm no Overpass timeout — compare timing against the existing 30km
  behavior.
- If shipping Phase 2: force a genuinely category-sparse test (e.g., a
  rural coordinate with no cafes at all) and confirm exactly one widen
  retry fires per zero-hit category, not a compounding loop — check
  request count/timing in logs matches the "8 requests worst case" budget
  above.
- Confirm a dense region (NYC) still completes in roughly the same time as
  before this change — Phase 1 shouldn't add latency anywhere, Phase 2
  shouldn't trigger any widening there at all.
