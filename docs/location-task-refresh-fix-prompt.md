# Fix: local tasks don't refresh when a user travels

Paste this whole file into a fresh Claude Code session in this repo to
execute the change, same as `docs/location-based-tasks-prompt.md` before it.
Self-contained brief: bug, confirmed root cause, target design, open
decisions, implementation order. File/line references were verified against
the current codebase as of this writing (2026-08-10); spot-check before
trusting blindly, but treat them as the starting map.

## The bug report

A user opened the Tasks tab after flying to Ponte Vedra Beach, FL and still
saw location-based tasks from home. Root cause is fully diagnosed (see
below) — this is not a request to re-investigate, it's the fix brief.

## Desired behavior (from the user, verbatim intent)

Each town/area has its own fixed set of location-based challenges that
rotate week to week. Two different users who are physically in the same
town during the same week see the **same bucket of tasks** — if user A
generates Ponte Vedra Beach's batch on Tuesday, and friend B arrives
Thursday, B should see A's same batch, not a freshly-rolled one. But if
either of them travels to a different town, their tasks should reflect
*that* town instead.

## What's already correct (don't touch)

The "shared bucket per town" requirement is **already implemented
server-side** and works today — this surprised me when I traced it, so
confirming it explicitly rather than having it get re-litigated:

- `bucketRegionKey` (`server/src/local-challenges.ts:59-62`) rounds any
  request's lat/lng to a 2-decimal grid (~1km cells) and is computed
  per-request from the request's own coordinates — there is no per-user
  state involved at all.
- `loadBatch` (`server/src/local-challenges.ts:70-81`) and the whole
  `GET /local-challenges` flow (`handleGetLocalChallenges`,
  `server/src/local-challenges.ts:282-327`) key **every** read and cache
  check off that region key. Two different users hitting the same region
  within the same 7-day `CACHE_TTL_MS` window get rows from the exact same
  D1 batch (same `created_at`, same ids) — nothing about serving is
  per-user.
- Client-side, `pickSuggestions` (`src/lib/store.ts:162-172`) picks which
  local challenges surface for weekly/monthly via `seededShuffle(pool, cadence
  + ':local:' + periodKeyFor(cadence))` — a pure function of the pool
  (region's batch) and the calendar period key, not of *when* the client
  happened to fetch. So even the "which 3 of the region's cached candidates
  show as this week's weekly picks" step is already deterministic and
  identical for any two users looking at the same region's batch during the
  same week.

**Conclusion: the generation and selection logic don't need to change.**
The single actual bug is that the client never asks the server for the
current region's batch after the first time, so it never discovers it
should be looking at a different town's bucket at all.

## The actual bug — confirmed root cause

`refreshLocalChallenges` (`src/lib/store.ts:430-455`) gates on elapsed time
**before** it ever reads GPS:

```ts
refreshLocalChallenges: async (force = false) => {
  const s = get();
  if (!force && s.localChallengesFetchedAt !== null && Date.now() - s.localChallengesFetchedAt < LOCAL_CHALLENGES_TTL_MS) {
    return { status: 'skipped' };
  }
  const location = await getCurrentRoundedLocation();   // never reached if the guard above trips
  ...
```

`LOCAL_CHALLENGES_TTL_MS = 7 * 24 * 60 * 60 * 1000` (`store.ts:18`). If the
user opened the app any time in the previous 7 days — which is normal,
including right before a flight — this guard trips and GPS is never
re-checked, so the app has no way to notice a change of location at all.
There is no lat/lng-delta comparison anywhere in the client.

The only automatic caller is a one-shot mount effect in `src/app/_layout.tsx:54-58`,
gated the same way. The Tasks screen itself (`src/app/quests.tsx`) has zero
local-challenges refresh logic — contrast with `refreshTimedChallenges(true)`,
force-called on every tab focus via `useFocusEffect` at `quests.tsx:37-41`,
with its own short 60s TTL (`TIMED_CHALLENGES_TTL_MS`, `store.ts:28`). Local
challenges got no equivalent per-visit trigger.

The only present-day way to force a refresh is toggling "Local tasks" off/on
in Settings (`src/app/settings.tsx:62-72`, calls `refreshLocalChallenges(true)`).
That path's comment (`settings.tsx:56-61`) is worth preserving in spirit: it
was deliberately built with no casual "get me a different one" button, so a
user can't reroll into an easier task. The fix below doesn't reopen that
door — see "Why this doesn't reopen the reroll loophole" below.

## Target design

### 1. Replace the blanket client TTL with a per-visit refresh

Change the trigger from "once per app mount, gated by a 7-day clock" to "on
every Tasks-tab focus, gated by a much shorter clock" — the same pattern
`refreshTimedChallenges(true)` already uses on `quests.tsx`. Concretely:

- In `src/app/quests.tsx`, add a `refreshLocalChallenges` call inside the
  existing `useFocusEffect` (`quests.tsx:37-41`), alongside
  `refreshTimedChallenges(true)`.
- Lower `LOCAL_CHALLENGES_TTL_MS` (`store.ts:18`) from 7 days to something
  short — suggest **30-60 minutes**. This is no longer doing the job of
  "how long is a region's task list valid" (the server's own 7-day
  `CACHE_TTL_MS` already owns that question); it's now purely a client-side
  throttle to avoid re-requesting GPS and hitting the network on every rapid
  tab switch. Pick a value that feels right for battery/GPS-call frequency,
  not one that tries to model task freshness.
- Keep the existing `_layout.tsx` mount-time call as-is (still useful for
  the case where the user never visits the Tasks tab but the app is open).

### 2. Why this doesn't reopen the reroll loophole

Worth stating explicitly since `settings.tsx`'s comment flags this concern:
refreshing more often does **not** let a user reroll into an easier task,
because both layers that determine what a user sees are deterministic and
independent of *when* the client asks:

- The server always returns the same region's same cached batch within its
  own 7-day `CACHE_TTL_MS` (rows are immutable, keyed by region — see
  "What's already correct" above).
- The client's own selection of *which* cached candidates fill this week's
  slots is a seeded shuffle keyed by `(region's pool, calendar period)`, not
  by fetch time (`pickSuggestions`, `store.ts:162-172`).

So a user re-fetching five times in one afternoon from the same spot gets
the identical result every time — refreshing more often only changes
behavior when the *region* actually changed, which is exactly the bug being
fixed.

### 3. Concurrent-generation race (edge case worth closing)

If a region's batch is missing or past the server's 7-day `CACHE_TTL_MS`
and two users request it within moments of each other (plausible once #1
above makes refresh more frequent — e.g., two friends arriving in the same
town close together), both requests can independently call `generateBatch`
(`server/src/local-challenges.ts:245-...`), since there's no locking around
it today. That produces two different batches (two different `created_at`
values) for the same region, and doubles the Overpass/Anthropic cost for
that moment — briefly breaking the "same bucket for everyone" guarantee
until the slower request's client eventually re-fetches and catches up to
whichever batch is now `MAX(created_at)`.

Suggested fix: a short-lived per-region generation lock in KV, mirroring
the existing empty-negative-cache pattern already in this file
(`local-challenges-empty:${regionKey}`, `local-challenges.ts:310-321`, via
`env.RATE_LIMIT`). Something like:

```ts
const genLockKey = `local-challenges-generating:${regionKey}`;
if (await env.RATE_LIMIT.get(genLockKey)) {
  // another request is already generating this region — serve stale/empty,
  // don't double up
} else {
  await env.RATE_LIMIT.put(genLockKey, '1', { expirationTtl: 60 }); // ~60s, generation is normally faster than this
  const generated = await generateBatch(env, regionKey, lat, lng);
  ...
}
```

This is a real gap given the stated requirement, but it's also a rare race
(two people within the same ~1km cell within a ~60s window of a cache miss)
— flagging it as a should-fix, not a blocker, in case you'd rather ship #1
alone first and revisit this separately.

### 4. Region granularity — open decision, not a bug

`bucketRegionKey`'s ~1km grid is a reasonable but imperfect proxy for
"town." A compact beach town like Ponte Vedra Beach likely fits in one or a
few adjacent cells, so this probably already behaves the way you want for
that scenario. But it's an approximation, not a real town boundary — a
larger town could span many cells (each getting its own bucket, which may
or may not be desired), and a cell near two small towns' shared border
could a) get requests from both and serve one town's tasks to both, or b)
split one town across cells inconsistently.

Two options, not resolving this here:

- **Keep the grid as-is** (recommended default — no change needed, cheap,
  already reasonably matches "town" at the scale most towns actually are).
- **Key by resolved place name instead** — reverse-geocode each request
  (Nominatim, same approach `city-image.ts`'s `reverseGeocodeCity` already
  uses, `server/src/city-image.ts:103-107`) and bucket by the resolved
  city/town name rather than raw coordinates. This would make "town"
  semantically exact rather than grid-approximate, at the cost of one extra
  Nominatim call per cache-miss request (not per read — cache hits stay
  free) and needing a coordinate-based fallback for unincorporated areas
  with no city/town field.

Flagging this because the user's own framing was explicitly about towns,
not grid cells — worth a deliberate yes/no rather than leaving it implicit.
Recommend deferring unless real-world testing shows the grid actually
splits/merges towns in a way that's noticeably wrong.

## Implementation order

1. `src/lib/store.ts` — lower `LOCAL_CHALLENGES_TTL_MS` to a short
   client-side throttle value (suggest 30-60 min).
2. `src/app/quests.tsx` — add `refreshLocalChallenges()` (no `force`, let
   the shortened TTL do its job) inside the existing `useFocusEffect`
   alongside `refreshTimedChallenges(true)`.
3. `server/src/local-challenges.ts` — add the per-region generation lock
   (KV-based, ~60s TTL) around the `generateBatch` call in
   `handleGetLocalChallenges`, per section 3 above.
4. Leave region-bucketing (`bucketRegionKey`) untouched per section 4,
   unless you tell me to switch it to reverse-geocoded town names.
5. Update the `settings.tsx:56-61` comment if its wording no longer matches
   reality once local challenges refresh per-visit instead of per-week —
   the anti-reroll reasoning still holds, but "rotates on its own via the
   background TTL refresh in `_layout.tsx`" will be stale once `quests.tsx`
   is also a trigger.

## Testing checklist

- Simulate travel: seed `localChallengesFetchedAt` to something >30-60 min
  old (or just wait it out) with the store's persisted state, then mock/
  change device location and confirm the Tasks tab picks up a new region's
  batch on next focus, without needing the Settings toggle workaround.
- Confirm two requests for the *same* region (e.g., two rapid tab
  re-focuses without moving) return the identical set of local challenges
  — proves the reroll concern in section 2 is actually holding.
- If implementing section 3: hit `GET /local-challenges` for a brand-new
  region key twice in immediate succession (e.g., two curl calls a few
  hundred ms apart) and confirm only one `generateBatch` runs (check
  `local_challenges` rows for that region — should be exactly one distinct
  `created_at`, not two).
- Re-run the existing location-based-tasks testing checklist
  (`docs/location-based-tasks-prompt.md`'s "Testing checklist" section) to
  confirm this change didn't regress the weekly/monthly local-task
  generation work from the previous change.
