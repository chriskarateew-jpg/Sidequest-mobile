# Location-Based Tasks: How They're Sourced and Presented

Living reference doc for how Gumpa's "local challenges" — the weekly and
monthly tasks tied to a real, nameable nearby place — actually work end to
end: where the venues come from, how one gets picked for a given user, how
the copy gets written, and how it shows up in the app. Written after the
2026-08-12 redesign (grid-cell batches → distance-based shared pool); keep
this updated as that logic changes rather than letting it drift stale.

Related, but narrower in scope: `docs/Live-Volume.md` covers this
system's cost/capacity numbers as part of a broader infra audit, not its
mechanics.

## 1. What a "local challenge" is

A task tied to one specific, real, named place instead of a generic
prompt — "Take a walk through Addison Park" instead of "Go outside for 20
minutes." Two cadences, distinguished by distance and reward, not by
venue type:

| Tier | Radius | Categories | Reward | Cadence |
|---|---|---|---|---|
| Weekly | ~8km flat | park, cafe, restaurant, landmark | 60 tokens (park/cafe/restaurant), 75 (landmark) | weekly |
| Monthly | ~45km flat | destination | 150 tokens | monthly |

Every local challenge is photo-verified (`proofType: 'camera'`, never
`'screenshot'`) and GPS-checked against the venue's real coordinates on
submission — see `server/src/complete.ts`'s `checkPhotoFraud`, hard
rejects outside 805m (`LOCAL_DISTANCE_THRESHOLD_METERS`). That
verification logic is untouched by anything below; it only ever reads a
`local_challenges` row's own `place_lat`/`place_lng`, independent of how
that row was created.

## 2. Where venues come from: OpenStreetMap via Overpass

**Overpass** (`https://overpass-api.de/api/interpreter`) is a free, public
query API over OpenStreetMap's map data — no API key, no account, no
guaranteed capacity. It's the *only* source of real-venue data in this
app (`server/src/places.ts`). No paid alternative (Google Places, Mapbox)
is wired in as of this writing.

**Operational caveat, confirmed repeatedly the hard way:** Overpass's
shared public instance is unreliable — frequent `429`s, `504`s, and
outright timeouts, independent of query complexity, especially under
sustained testing load. Every call already retries once and degrades
gracefully to "found nothing this attempt" (`runQuery` in `places.ts`),
never a hard failure — but a single Overpass hiccup can mean a real venue
that should be discoverable just isn't, on that particular attempt. If
task quality in an area seems to have plateaued, retrying later (once
Overpass has capacity) is often the actual fix, not a code change.

### 2.1 What gets queried, by category

All tag matching happens in four query builders, each producing one
Overpass request:

| Function | Feeds category | OSM tags matched |
|---|---|---|
| `buildCloseQuery` | park | `leisure` = park \| nature_reserve \| garden (node+way+relation) |
| | cafe | `amenity=cafe` (node only) |
| | restaurant | `amenity=restaurant` (node only) |
| `buildLandmarkQuery` | landmark | `tourism` = attraction \| museum \| viewpoint \| artwork \| gallery; `historic` = monument \| memorial \| castle \| ruins; `amenity` = theatre \| arts_centre \| cinema \| ice_cream; `leisure` = miniature_golf \| bowling_alley \| amusement_arcade; `shop` = gift \| books \| art \| antiques \| toys \| music \| chocolate \| florist |
| `buildDestinationQuery` | destination | same tourism/historic/theatre tags as landmark, at the wide radius |
| `buildNatureQuery` | park (weekly) or destination (monthly), via a `category` param | `boundary=protected_area` (way only); `leisure=nature_reserve` (way **and** relation); `natural=beach` (node+way) |

A place needs an OSM `name` tag to be considered at all — unnamed
features are always skipped.

**Why `buildNatureQuery` is separate from the other three:** confirmed
live that bundling protected-area/beach/nature-reserve tags into the same
request as tourism/historic/theatre tags reliably pushed the combined
query past Overpass's 25-second timeout, even at the same radius as the
other queries alone. Splitting it means a nature-tag timeout only costs
that one slot, not the whole fetch.

**Why some tags query OSM *relations* and others don't:** a large,
well-known place (a state park, a big nature reserve) is often mapped as
a *relation* (a multi-shape boundary), not a single point or simple
shape. Querying relations is much more expensive for Overpass than
querying points — expensive enough that it can fail outright. Tested each
relation query in isolation before deciding:
- `rel["leisure"="nature_reserve"]` — reliably fast (a few seconds). **Included.**
- `rel["boundary"="protected_area"]` — reliably failed even alone. **Excluded** — a protected area not also tagged `leisure=nature_reserve` won't be found. Real loss (some WMAs/forests are `boundary=protected_area` only), accepted as the cheaper tradeoff.

If Overpass's reliability improves, or a real miss traces back to this
gap, this is the first thing worth re-testing (search this file's git
history / `places.ts`'s comments for "tested live" before re-adding
anything — the reasoning was empirical, not assumed).

### 2.2 Content safety filter

Every discovered place's name is checked against `isInappropriateVenue`
(`places.ts`) before it's ever kept — a regex blocklist (adult, strip
club, sex club/shop, swinger, xxx, erotic, nude, topless, escort, bdsm,
fetish, peep show, gogo bar), case-insensitive, whole-word matched. Added
after a real venue tagged plainly `amenity=theatre` (indistinguishable by
tag from a legitimate community theater) turned out to be a sex club —
**OSM's own tagging is not a reliable safety signal on its own.**

This is a name-keyword filter, not real content moderation — it catches
places that say what they are in the name, nothing more. If this keeps
missing things, the next step up would be a moderation API or a manual
review queue for newly-discovered venues, not a bigger keyword list.

## 3. The three-table architecture

### `venue_pool` (migration `0024_venue_pool.sql`)

Long-lived, deduped real venues. One row per physical place, identified
by its OSM `(osm_type, osm_id)` pair (a node and a way can share a
numeric id, so both fields together are the real key). Copy
(`title`/`description`/`long_description`) is written **once**, the first
time a venue is discovered, and never regenerated on rediscovery — only
`name`/`lat`/`lng`/`prominent`/`category`/`subtype` get refreshed if the
place is found again later. `prominent` (0/1) is set from whether OSM
links the place to a Wikipedia or Wikidata article — a cheap, reliable
proxy for "genuinely known place" vs. a random subdivision amenity.

### `place_fetch_log` (migration `0025_place_fetch_log.sql`)

Throttles *when Overpass gets hit*, deliberately decoupled from matching
radius. A fetch centered near `(lat, lng)` is trusted for
**14 days** if it found anything, **1 hour** if it found nothing
(`POOL_FETCH_TTL_MS` / `EMPTY_POOL_FETCH_TTL_MS`, `local-challenges.ts`).
"Near" means within **20km** (`FETCH_COVERAGE_RADIUS_M`) — deliberately
wider than the 8km weekly radius (so ordinary GPS jitter never triggers a
spurious re-fetch) and narrower than the 45km monthly radius (a fetch
that far out has already scanned close to the full monthly radius from
its own origin, so it likely already covers a nearby user too).

### `local_challenges` (existing table, extended by migration `0026`)

The user-facing row — what a client actually sees and what
`getLocalChallengeById` resolves. A pool venue becomes a row here the
first time *any* user's selection for the *current period* picks it,
via `INSERT OR IGNORE` keyed on `(venue_id, period_key)`. This is the
mechanism that lets two nearby users converge on the identical task:
same venue, same period → same row, same id, not two separate copies.
Pre-2026-08-12 rows have `venue_id`/`period_key` = `NULL` and are
untouched — nothing downstream reads those columns, so old rows keep
resolving exactly as before.

## 4. How one request gets served (`handleGetLocalChallenges`)

1. **Coverage check.** Has any fetch within 20km of this exact `(lat, lng)`
   succeeded in the last 14 days (or failed in the last hour)? If yes,
   skip straight to step 3 — this is the common case, no Overpass call at
   all, typically ~2 seconds.
2. **If not covered:** check a per-user rate limit
   (`local-challenges-fetch:${userId}`, 5/day — checked *after* the
   coverage/lock checks, not before, so a request that was always going
   to skip fetching doesn't burn quota for nothing). If allowed, run
   `populateVenuePool`: fetch all four query types from Overpass
   (weekly-tier pair, then monthly-tier pair, sequentially — never
   concurrently across more than 2 requests at once, since 3+ concurrent
   Overpass calls were observed getting `429`'d), upsert every discovered
   place into `venue_pool`, batch-generate Claude copy for whatever's
   newly inserted, then record fetch coverage. A concurrent duplicate
   request for the same area waits on and reuses this instead of
   re-fetching (`waitForInFlightPoolFetch`).
3. **Selection.** For each weekly category (`park`, `cafe`, `restaurant`,
   `landmark`), and once for `destination` at the wide radius: find every
   pool venue within radius (`findEligibleVenues` — a bounding-box
   prefilter then an exact distance check, no spatial database extension
   needed at this scale), then pick which ones win a slot
   (`selectVenuesForCategory`, see §5).
4. **Materialize.** Each selected venue becomes (or resolves to an
   already-existing) `local_challenges` row for the current period
   (`materializeChallenge`).
5. **Respond**, with a per-venue image (Wikimedia Commons, falling back
   to a shared region photo, never repeating an image within one batch)
   and the assembled challenge list.

## 5. Selection: which venue actually wins a slot

`selectVenuesForCategory(eligible, periodKey, category, slots)`:

1. Rank all eligible venues by `prominent` (true first), tie-broken by
   venue id.
2. Take the top 5 (`SELECTION_TOP_K`).
3. **The single most prominent venue (`primary`) is always selected,
   unconditionally, and never rotates.** This is the load-bearing
   guarantee: if a venue is the #1 pick for two different users — whether
   they're 100m apart or 50km apart — they get the *identical* task,
   forever, by construction. This is what makes "two nearby towns share a
   landmark" work.
4. The remaining `slots - 1` picks rotate: sorted by a deterministic hash
   of `venueId:periodKey:category` (`rotationScore`, FNV-1a — same
   algorithm the client already uses for its own seeded shuffle,
   independently implemented server-side). Changes every period
   (week/month), same algorithm on every server, no shared state needed.

**What's guaranteed vs. not:** the `primary` slot converges for any two
users who both rank the same venue #1. The rotation slots converge only
when both users' full top-5 sets agree — likely in a sparse area with one
obvious standout, less certain in a dense area with several
comparably-prominent competitors. This is a real, honest limit — not a
bug to "fix" by making prominence more granular than a boolean, which
OSM's Wikipedia/Wikidata coverage doesn't reliably support anyway.

## 6. Copy: how the title/description get written

One Claude Haiku call per `populateVenuePool` pass, covering every newly
discovered venue in that pass at once (`generateCopy`, model
`claude-haiku-4-5-20251001`). Asks for three fields per venue: a short
imperative title, a one-sentence card description, and a 2-3 sentence
long description (shown in the tap-to-expand detail view, §7). The
prompt:
- requires grounding in something *specific* about the named place (a
  known dish, a distinctive feature), not a generic category description
- explicitly varies sentence openings across the batch so multiple
  same-category venues don't all read identically
- gets a `subtype` hint per venue (`deriveSubtype` in `places.ts` — e.g.
  "beach", "mini golf course", "ice cream shop") so a beach gets "take a
  swim," not "take a walk"
- gets a "near:" note for venues within 400m of another venue in the same
  batch, so copy can naturally suggest pairing two close-together spots
- is told never to invent unverifiable facts (hours, prices, superlatives)

**Fallback, not a hard dependency:** if Claude fails or writes copy that
doesn't actually name the venue (`mentionsVenue` check), that specific
venue falls back to `templatedCopy` — a deterministic, venue-name-based
template (`CATEGORY_TEMPLATES` in `local-challenges.ts`, 3 phrasing
variants per category so same-category fallbacks in one pass don't read
identically). This is also what a venue's copy is *first* written as at
insert time, upgraded to Claude's copy moments later if that call
succeeds — a venue is never left in a "no copy yet" state.

## 7. Client presentation

- **Card** (`src/components/challenge-card.tsx`): title, one-sentence
  description, cadence badge (Weekly/Monthly), reward pill, background
  image if one resolved. Local cards get a distinct glow border +
  animated barrier stripe (`LocalBarrierBorder`) so a real-place task
  reads as visually distinct from a generic one at a glance.
- **Detail view** (`src/components/location-detail-modal.tsx`): tap the
  map-pin icon on a local card to open a modal with the place name, the
  longer description, and a **Get Directions** button that opens
  `https://maps.apple.com/?daddr=<lat>,<lng>` (a universal link — opens
  the Apple Maps app on iOS if installed, degrades to a normal web page
  on any other platform, no platform branching needed).
- **Which challenges actually get shown:** the server can return up to 8
  weekly candidates (2 per category × 4 categories) and 3 monthly ones,
  but the client only displays 3 weekly / 1 monthly at a time
  (`pickSuggestions` in `src/lib/store.ts`). The local portion of that
  selection is ranked by a **stable per-item score**
  (`hashStr(challenge.id + ':' + period)`), not shuffled — this matters
  for the same convergence reason as §5: a plain shuffle's result depends
  on the whole array's length and each item's position, so two users who
  both received the same converged venue+id from the server could still
  have the client display it for one and drop it for the other. A
  per-item score ranks a given id identically for every user who has it,
  regardless of what else is in their array. (The *static* catalog
  portion still uses the old shuffle — it has no cross-user convergence
  requirement.)

## 8. Known limitations, honestly stated

- **Overpass reliability is the single biggest practical risk to task
  quality**, not anything in this app's own logic — see §2.
- **The content-safety filter is a name-keyword list**, not real
  moderation. It'll miss anything that doesn't say what it is in the name.
- **Rotation-slot convergence isn't guaranteed**, only likely — see §5.
- **`rel["boundary"="protected_area"]` is excluded** for cost reasons —
  some protected areas (ones not also tagged `leisure=nature_reserve`)
  are structurally invisible to this system. See §2.1.
- **No density adaptivity** — weekly/monthly radii are flat 8km/45km
  everywhere, a deliberate product decision (rely on the prominence
  ranking to keep dense areas from being overwhelming, rather than
  shrinking the radius). If a specific area proves this wrong, the fix is
  a radius change or a smarter selection rule, not a re-architecture.
- **A venue's copy is never refreshed** after first insert, even if the
  real place's name changes in OSM later. Accepted tradeoff for "generate
  once, reuse forever" — the alternative (periodic re-generation) reintroduces
  the Claude-cost-per-region-per-week problem this redesign removed.
- **Paid alternatives exist** (Google Places, Mapbox, Foursquare) if
  Overpass's reliability becomes a hard blocker rather than an annoyance —
  not wired in, would need real engineering + a billing decision, not a
  quick swap. See the chat context around 2026-08-12 for a rough cost
  comparison if that becomes worth revisiting.
