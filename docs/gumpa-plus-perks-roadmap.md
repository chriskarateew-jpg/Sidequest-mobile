# Gumpa+ perks & token UI roadmap

The checklist for building out the Gumpa+ bundle described in
`docs/rewards-economy-plan.md`, plus two standalone UI asks (the monthly
activity calendar and the token visual redesign) that aren't Gumpa+-gated
but were requested alongside it. Work through phases **one at a time, in
order** — implement, verify (typecheck + a real local/live check, not just
"it compiles"), record the outcome in this doc, then stop and move to the
next phase in a later turn. Don't parallelize multiple phases in one pass;
each phase's outcome is meant to inform the next, and the point of going
one at a time is to keep every phase's functionality and UI actually
correct rather than shipping six things at once and finding the bugs
later.

Ordered by risk/complexity, cheapest and most self-contained first:

1. Token UI redesign
2. Cosmetic flare
3. Monthly activity calendar
4. Exclusive / early-access challenges
5. Token earn multiplier
6. Streak protection

## Phase 1: Token UI redesign

**Ask**: "make tokens stick out more for the user, separate them off, make
them look better and cooler."

**Scope**: A visual-only pass, no backend or state changes. Tokens
currently render as a plain gold pill (`CoinIcon` + number) reused
identically across Profile, Rewards, and anywhere else a balance shows.
Give tokens their own distinct visual identity — likely a more prominent
badge/card treatment, a bit of shine/gradient or motion (this app already
uses `react-native-reanimated` for pulse effects, see `rewards.tsx`'s
`pulse` animation), something that reads as "a currency worth noticing,"
not just another stat. Must stay within the existing Gumpa palette
(`src/constants/theme.ts` — blue accent, gold reserved for tokens/rewards
already) and keep `CoinIcon` (`src/components/rail-icons.tsx`) or a
refined version of it, not an emoji.

**Touches**: `src/components/rail-icons.tsx` (CoinIcon, maybe a richer
variant), `src/app/profile.tsx` (the TOKENS stat), `src/app/rewards.tsx`
(the balance pill), possibly a new shared `<TokenBadge>` component if the
same treatment is meant to repeat in more than one place rather than
duplicating styles.

**Status: done (2026-08-13).**

- Found five separate places rendering a token amount, each with its own
  copy of `<CoinIcon/><Text>`: `profile.tsx`'s stat row, `rewards.tsx`'s
  balance pill and per-tier cost, `challenge-card.tsx`'s `RewardPill`
  (including the boosted/crossed-out variant), `submission-result-modal.tsx`'s
  celebratory reward row, and `completed.tsx`'s reward pill. The last one
  was still using a literal 🪙 emoji, not `CoinIcon` at all — a direct
  AGENTS.md violation, fixed as part of this pass rather than left for a
  separate cleanup.
- Built one shared component, `src/components/token-badge.tsx`
  (`TokenBadge`): a gold-gradient (`Colors.gold` → new `Colors.goldDeep`,
  added to `theme.ts`) circular coin behind `CoinIcon`, three size variants
  (`sm`/`md`/`lg`), and an optional `strikeValue` for the boosted-reward
  case. Takes a pre-formatted `value` string rather than a raw number —
  the right format ("+75", "1,240", "500") differs by context, not
  something the component should guess. Replaced all five raw
  `CoinIcon`+`Text` call sites with it; removed the now-dead
  `rewardText`/`rewardTextStruck`/`balanceText`/`tierCost` styles each
  left behind.
- On Profile specifically (the "stick out more, separate them off" ask):
  pulled TOKENS out of the equal three-column Coin/Streak/Level stats row
  into its own gold-tinted hero card above it, with a slow scale pulse on
  the coin (same `withRepeat`/`withTiming` motion `rewards.tsx` already
  uses for its "Unlocks with Gumpa+" pill, so the animation language stays
  consistent app-wide rather than inventing a new one). Streak/Level now
  share a plain two-column row where Coin/Streak/Level used to be three —
  incidentally also fixed a pre-existing bug where Profile's coin icon
  rendered in the app's blue accent color, not gold, because the generic
  `Stat` component passed every icon the same color.
- Verified for real, not just by typecheck: ran the app via the
  `run-gumpa-mobile` skill (Expo web + headless Chromium) against a live
  test account and screenshotted Profile, Rewards, and Tasks. Confirmed on
  all three: the gradient coin renders correctly (no broken/blank icon),
  the Profile hero card is clearly visually separated from Streak/Level
  with no layout overlap or cut-off, and the small-size badge on Rewards'
  per-tier cost and Tasks' `RewardPill` both render correctly at the
  smaller size. No console errors on any of the three screens.
  `submission-result-modal.tsx` (the `lg` variant) and the fixed
  `completed.tsx` emoji weren't independently screenshotted — both call
  the identical `TokenBadge` component already confirmed working at the
  other two sizes, just with a different `size` prop, so the incremental
  risk left there is low, but note that as the one thing this pass didn't
  see rendered live, in case it's worth a follow-up look.
- `npx tsc --noEmit` clean on both `server/` and the root app throughout.

## Phase 2: Cosmetic flare

**Ask**: a Gumpa+ subscriber perk — visible status, no functional effect.

**Scope**: Something small and durable a subscriber sees about themselves
(and possibly others see about them) purely because they're subscribed —
e.g. a badge next to their username on their own profile, or a subtle
border/glow on their avatar. Gate strictly on `has_gumpa_plus`, which is
already live server-side (`server/src/subscriptions.ts` sets it via the
RevenueCat webhook) even though nothing can flip it true yet in production.
Build and verify the display logic now so it's dormant-but-correct, same
posture as `HAS_GUMPA_PLUS` in `rewards.tsx` — don't wait for real
subscribers to exist before writing the UI for what they'll see.

**Design decision needed before starting**: where does the flare actually
show — own profile only, or anywhere the user's name/avatar appears (feed
posts, friends list, comments)? Showing it everywhere is more visible but
touches more files; own-profile-only is a safe, contained first version.
Default to own-profile-only unless told otherwise when this phase starts.

**Touches**: `src/app/profile.tsx`, `GET /auth/me` response (needs to
surface `hasGumpaPlus` to the client — check `server/src/auth.ts`'s
`userSummary` and `handleMe`), `src/lib/auth.ts`'s user type/store.

**Status: done (2026-08-13).**

- Went with the documented default (own-profile only) since nothing
  overrode it when this phase started.
- Server: added `has_gumpa_plus` to `UserRow`/`userSummary` in
  `server/src/auth.ts`, threaded through `hasGumpaPlus` on
  `POST /auth/signup`, `POST /auth/login`, and `GET /auth/me` (the SELECT
  in `handleMe` needed the column added explicitly since it wasn't using
  `SELECT *`). No new migration — `has_gumpa_plus` already existed on
  `users` from `0027_gumpa_plus_subscriptions.sql`. Explicitly a cosmetic-
  only read: nothing money- or token-gated trusts this client flag, the
  real endpoints (`/rewards/redeem`, Store) already re-check
  `has_gumpa_plus` server-side independently.
- Client: added `hasGumpaPlus: boolean` to `AuthUser`
  (`src/lib/auth.ts`) — flows through automatically since signup/login/me
  all set the whole user object directly from the server response.
- UI: a small blue-gradient "GUMPA+" pill next to `@username` in Profile's
  account card, reusing the same accent gradient already established for
  the "G+" lock badge on `rewards.tsx`'s locked reward tiers, so it reads
  as the same brand mark rather than a new one-off style.
- Verified for real: since `has_gumpa_plus` can't be flipped true by any
  real flow yet (no RevenueCat account), stood up a local wrangler dev
  server + local D1, pointed a local Expo web build at it
  (`EXPO_PUBLIC_API_URL` override), and drove it with the
  `run-gumpa-mobile` skill's Playwright driver. Confirmed: a fresh
  local test account shows no badge; after manually setting
  `has_gumpa_plus = 1` directly in local D1 (simulating what the webhook
  will eventually do) and logging in again, the badge renders correctly
  next to the username with no layout issues; a direct `curl` against
  `GET /auth/me` confirmed `hasGumpaPlus: true` in the JSON response. No
  console errors. Test user and both local dev servers cleaned up
  afterward.
- `npx tsc --noEmit` clean on both `server/` and the root app.

## Phase 3: Monthly activity calendar (profile)

**Ask**: "a month long calendar in the profile screen showing the days an
activity was completed on" — Strava-style, but with Gumpa's own styling,
not a copy.

**Scope**: Good news found while scoping this — **no new backend endpoint
needed.** `GET /posts/mine` (`server/src/feed.ts`'s `handleListMyPosts`,
already fetched by `src/lib/posts.ts`'s `fetchMyPosts`) already returns
every completed task with a `createdAt` timestamp, capped at the most
recent 200. That's every input a "which days did I do something" calendar
needs — group by local calendar day, render a month grid, mark days with
at least one post. Consider whether a day with multiple completions should
look different from a day with one (Strava distinguishes activity
count/intensity per day; Gumpa's version should pick its own visual
language for that per the "don't copy it" instruction, e.g. filled-vs-
outlined dots in the brand blue, not a green heatmap gradient).

**Design decisions needed before starting**: (1) fixed to the current
month, or swipeable/paged across past months — a swipeable version is
richer but meaningfully more component complexity than a static current-
month grid; default to a static current month first, revisit if it feels
thin. (2) Where it sits on the Profile screen relative to the existing
stats card and the new Store link card from this session.

**Touches**: new component (e.g. `src/components/activity-calendar.tsx`),
`src/app/profile.tsx` (fetch `fetchMyPosts` — or a lighter dedicated
summary if 200 posts proves wasteful to pull just for a calendar — and
render the grid).

**Status: done (2026-08-13).**

- Went with both documented defaults: static current month (no
  paging/swiping), placed on Profile right after the Streak/Level card and
  before the Store link card.
- Confirmed no new backend needed, as scoped — `src/app/profile.tsx` now
  calls the existing `fetchMyPosts` (`src/lib/posts.ts`) on mount and
  passes the result straight to the new `ActivityCalendar` component.
- `src/components/activity-calendar.tsx`: groups posts by **local**
  calendar day (not the server's UTC period keys used for cadence resets
  elsewhere — deliberately different concept, this is "which day did the
  user themselves complete something"), renders a 7-column month grid of
  circular day markers. Three visual tiers answer the roadmap's open
  question about multiple same-day completions: plain outline (0), a soft
  accent-tinted fill (1), a solid accent fill (2+) — plus a small dot
  under today's cell that's independent of fill state, rather than a
  border ring (a ring would have blended into the solid-fill case's own
  same-colored border on a heavy-activity today).
- Verified for real: stood up a local server + local client again, signed
  up a fresh account, and seeded four `posts` rows directly in local D1 —
  two on today's date, one three days back, one deliberately in last
  month. Confirmed on the live screenshot: today rendered solid-filled
  (2 completions), three-days-back rendered soft-filled (1 completion),
  every other day in the grid plain, the header correctly read "2 active
  days" (not 3 — the last-month post correctly excluded from both the grid
  and the count), and the month label matched the real current month. No
  console errors. Seeded posts, test user, and both local dev servers
  cleaned up afterward.
- `npx tsc --noEmit` clean.

## Phase 4: Exclusive / early-access challenges

**Ask**: a Gumpa+ perk — some challenges are subscriber-only or subscribers
see them first.

**Scope**: Add a gating field to `dev_challenges` (e.g.
`gumpa_plus_only INTEGER NOT NULL DEFAULT 0`, or an `early_access_until`
timestamp for a "subscribers get it first, everyone else N days later"
model — decide which one models the ask better before writing the
migration, they're different mechanics and probably shouldn't both ship at
once). Filter it at the same place every other challenge-visibility rule
already lives: `resolveBaseCatalogEntry`/`GET /challenges/custom`
(`server/src/dev-challenges.ts`) and `pickSuggestions`
(`src/lib/store.ts`). Needs the dashboard (`dashboard/`) and/or the mobile
dev panel (`src/app/dev-challenge-form.tsx`) extended so a developer can
actually author a gated challenge — don't ship the gating mechanism without
a way to use it.

**Touches**: new migration, `server/src/dev-challenges.ts`,
`server/src/catalog.ts`, `src/lib/store.ts`, `dashboard/src/pages/TaskForm.tsx`,
`src/app/dev-challenge-form.tsx`.

**Status: done (2026-08-13).**

- The open design question got resolved by explicit direction: "early
  access challenges should only be toggable by the developer... some may
  be early access while others get pushed to the entire user base" — a
  plain manual boolean (`early_access` on `dev_challenges`), not the
  `early_access_until` timestamp/auto-expiry model this doc had floated.
  The developer flips it off whenever they decide to push a task to
  everyone; nothing expires on its own.
- `src/lib/store.ts` ended up needing **zero** changes, correcting this
  doc's own touches list — filtering happens once, server-side, in
  `GET /challenges/custom`, so a non-subscriber's `customChallenges` array
  never contains an early-access row to begin with. `pickSuggestions`
  can't leak what it never received. Simpler and safer than filtering
  client-side.
- **Real enforcement, not just a listing filter**: an early-access
  `CatalogEntry` carries a new `earlyAccessOnly` flag
  (`server/src/tokens.ts`/`catalog.ts`), independently re-checked against
  `has_gumpa_plus` in both `verify.ts` (before spending a real Anthropic
  call — no point paying for verification on a submission that could never
  be claimed) and `complete.ts` (before any completion row is written).
  The listing filter alone would only have stopped discovery, not a client
  that already had the id some other way.
- Added a shared `userHasGumpaPlus(env, userId)` helper in
  `subscriptions.ts` (the file that already owns writing that column) and
  used it in all three call sites (`dev-challenges.ts`,
  `verify.ts`, `complete.ts`) instead of three copies of the same inline
  query.
- Both admin authoring surfaces got the toggle, matching the "only the
  developer can flip this" requirement: the Expo dev panel
  (`dev-challenge-form.tsx`, an always-visible Switch next to the existing
  Active one) and the standalone dashboard (`TaskForm.tsx`, a checkbox).
  Both list views (`dev.tsx`, dashboard `TaskList.tsx`) show a "Gumpa+
  early access" indicator so the developer can see gating status without
  opening each task. The server also accepts a bare `{"earlyAccess": bool}`
  PATCH (mirroring the existing bare `{"active": bool}` toggle) for a
  one-tap "push to everyone" without resending the whole form.
- Verified for real, end to end: stood up a local server + local D1,
  created a throwaway "developer" account (`DEV_USER_ID` set temporarily,
  reverted after) and a second plain account. Direct API tests confirmed:
  the early-access task is absent from a non-subscriber's
  `GET /challenges/custom` (40 vs. 41 total) but present once
  `has_gumpa_plus` is set; `/complete` rejects the non-subscriber with a
  403 and the completions row is never created, then gets past the gate
  (failing on the expected fake-photo-proof error instead) once
  subscribed; `/verify` rejects the non-subscriber before ever attempting
  the Anthropic call; the bare `{"earlyAccess": false}` PATCH correctly
  makes the task visible to the non-subscriber afterward. Also drove the
  real Expo dev panel UI (not just the API) via the `run-gumpa-mobile`
  skill: confirmed the list shows "Gumpa+ early access" next to the test
  task and the edit form's new Switch renders in the correct on state. The
  dashboard's mirrored UI was typechecked (`npx tsc -b`, clean) but not
  independently click-tested live — same reasoning as Phase 1's
  unscreenshotted spots, it's a straightforward mirror of the
  already-verified Expo form. All test data (task, both users, and a
  completions row created by an intentionally-fake `/complete` call)
  cleaned up afterward.
- `npx tsc --noEmit` clean on `server/` and the root app; `npx tsc -b`
  clean on `dashboard/`.

## Phase 5: Token earn multiplier

**Ask**: Gumpa+ subscribers earn tokens faster.

**Scope**: This session already built the exact mechanism this needs, for
the Store's `boost_2x_24h` item —
`getActivePersonalBoostMultiplier`/`user_boosts` in `server/src/store.ts`,
already applied at credit time in `server/src/complete.ts`. A Gumpa+
earn multiplier is the same effect, different trigger: instead of only a
one-time purchase granting a time-boxed `user_boosts` row, an active
subscription should itself count as a standing multiplier for as long as
`has_gumpa_plus` is true. Cleanest implementation is probably a small
change to `getActivePersonalBoostMultiplier` (or a sibling function) to
also check `users.has_gumpa_plus` and take the best of "subscription
multiplier" vs. "any active purchased boost," rather than a second parallel
code path. Pick the actual multiplier value (1.5x suggested, not locked)
before implementing — that's a business decision, not a technical one, and
changes the margin math in `docs/rewards-economy-plan.md`'s bundle table
only in that it makes the subscription more attractive at ~zero
marginal cost (tokens only become a real dollar liability at capped
redemption, which this doesn't change).

**Touches**: `server/src/store.ts` (or wherever the merged lookup lands),
`server/src/complete.ts` (already calls the multiplier lookup — should
need no change there if the lookup function itself is extended).

**Status: done (2026-08-13).**

- Went with the suggested-but-undecided 1.5x (`GUMPA_PLUS_EARN_MULTIPLIER`,
  `server/src/store.ts`) since nothing overrode it when this phase started
  — easy to retune later, it's one constant and doesn't touch the
  redemption cap math at all.
- Extended `getActivePersonalBoostMultiplier` exactly as this doc
  predicted: it now reads `has_gumpa_plus` alongside the existing
  `user_boosts` query and takes `Math.max(purchasedMultiplier,
  subscriptionMultiplier)` — a subscriber who also buys a Store boost gets
  the better of the two, never both stacked (2x purchased + 1.5x
  subscription doesn't become 3.5x). `complete.ts` needed **zero**
  changes, confirming this doc's own prediction — it already called this
  function and already applies whatever it returns to both the credited
  tokens and the feed post's displayed amount.
- Deliberately didn't add a "you're earning 1.5x" preview to challenge
  cards before completion. The true amount already surfaces correctly
  with no new client code (the submission-result modal and Completed
  screen already show whatever `complete.ts` actually credited, unchanged
  since Phase 1's `TokenBadge` work). A pre-completion preview would need
  the client to replicate the full server-side stacking order (admin
  challenge-wide boost, then the personal multiplier on top) purely for
  display — real risk of drifting out of sync with the authoritative
  server math for a cosmetic preview. Skipped; the real reward is what
  matters and that's already correct.
- Avoided a circular import: `subscriptions.ts` already imports from
  `store.ts` (for `applyStorePurchase`), so `store.ts` reading
  `has_gumpa_plus` reuses a plain inline query rather than importing
  `subscriptions.ts`'s `userHasGumpaPlus` helper back — noted inline so a
  future pass doesn't try to "clean up" the duplication into a cycle.
- Verified the merged logic directly against local D1 rather than through
  a full live `/complete` call — generating a real decodable JPEG for the
  photo-hash thumbnail outside the Workers/browser runtime hit the same
  category of sandbox limitation as the Anthropic API key in earlier
  phases (`@jsquash/jpeg`'s encoder tries to `fetch()` its own wasm module
  internally, which doesn't work in plain Node). Instead seeded four test
  users covering every combination (no boost/no sub, no boost/sub, 2x
  boost/no sub, 2x boost/sub) and ran the function's exact two queries
  against each: results were 1, 1.5, 2, and 2 respectively — matching
  `Math.max` exactly, including the "doesn't stack" case. Combined with
  the already-clean typecheck and the unchanged, already-tested
  `complete.ts` call site (verified live in the Store phase), this is the
  same rigor already applied and accepted for the purchased-boost side of
  this exact function earlier in this session.
- `npx tsc --noEmit` clean.

## Phase 6: Streak protection

**Ask**: Gumpa+ subscribers don't lose their streak from one missed day.

**Scope**: The most complex phase — do it last, with full context from
everything above. Important finding from scoping this session: **the "day
streak" shown on Profile is entirely client-side and device-local**
(`src/lib/store.ts`'s `streak: { count, lastDay }`, computed in
`applyReward`/`currentStreak`), never synced to or verified by the server.
This is a different concept from a challenge's own `verify: 'streak'` type
(e.g. "5 nights of digital sunset," tracked server-side via
`completions.progress`/`last_checkin_day` in `complete.ts`) — protection
almost certainly means the Profile-facing daily-engagement streak, not the
per-challenge one, but confirm that assumption before building.

Because it's client-local today, "protecting" it is currently just a
client-side logic change (allow a 2-day gap instead of 1 before
`currentStreak()` resets to 0, gated on `has_gumpa_plus`) — no server
round-trip strictly required for a first version. Whether that's trustworthy
enough long-term (a user could locally fake a streak already, protection
doesn't change that trust boundary) or whether this is the moment to move
streak tracking server-side (more correct, meaningfully more work,
would also make the deferred Store "streak freeze" item buildable
immediately after) is a real design decision — make it explicitly, don't
default into either without noting the tradeoff in this doc when the phase
starts.

**Touches**: `src/lib/store.ts` (`applyReward`, `currentStreak`), possibly
a new server-side streak table and endpoint if going the server-authoritative
route.

**Status: done (2026-08-13).**

- **Design decision, made explicitly per this doc's own instruction**: kept
  the streak client-side rather than moving it server-authoritative.
  Reasoning: the streak is already fully client-fakeable today (device
  localStorage tampering), so going server-side wouldn't close a real
  security gap — nothing of value (money, tokens, redemption) is gated on
  it, it's a pure vanity/motivational number. Moving it server-side would
  have meant a new migration, a new table, a new endpoint, and a client
  reconciliation path for what's otherwise a cosmetic display, entirely
  out of proportion to the ask. Confirmed the assumption this doc flagged:
  protection means the Profile-facing daily-engagement streak
  (`src/lib/store.ts`'s `streak`), not a challenge's own `verify: 'streak'`
  type (server-tracked, a completely different mechanic) — never touched
  that one. Server-authoritative tracking remains a valid future move,
  specifically once/if the deferred Store "streak freeze" item
  (`server/src/store.ts`'s comment on why it wasn't built in the Store
  phase) actually gets built — noted here rather than silently defaulted
  past, per this doc's own instruction not to.
- Implementation: `applyReward` and `currentStreak` in `src/lib/store.ts`
  now share one extra day of grace, gated on
  `useAuthStore.getState().user?.hasGumpaPlus` (the same client flag
  Phase 2 wired up) — a subscriber's streak survives exactly one full
  skipped day, not unlimited. Added a small `daysAgo(n)` helper alongside
  the existing `dayKey` to avoid a third/fourth copy of the
  `new Date(Date.now() - N * 86400000)` pattern now that both functions
  check two days back instead of one.
- Verified live against a real local server + client rather than relying
  on code review alone. Added a reusable `seed-streak <count> <daysAgo>`
  command to the `run-gumpa-mobile` skill's Playwright driver (mirrors the
  existing `seed-local` pattern — writes `gumpa_state_v1`'s `streak` field
  via `addInitScript` before `nav`), letting the grace-day boundary be
  tested without waiting real days to pass. Confirmed all four
  combinations on the real Profile screen: non-subscriber at 1 day ago
  shows the streak (baseline unchanged), non-subscriber at 2 days ago
  shows 0 (no grace, unchanged), subscriber at 2 days ago **still shows
  the streak** (the new protection working), subscriber at 3 days ago
  shows 0 (grace is exactly one day, not unlimited — the boundary holds).
  No console errors on any of the four. `applyReward`'s increment-vs-reset
  logic (what happens the moment a subscriber *completes* something during
  the grace day, as opposed to just viewing the display) wasn't
  independently live-tested — doing so needs a full photo through
  `/verify`+`/complete`, which hit the same sandbox limitation as the
  Anthropic API key in earlier phases when generating a real decodable
  JPEG outside the Workers/browser runtime (`@jsquash/jpeg`'s encoder
  tries to `fetch()` its own wasm module internally). Accepted as the same
  category of gap already noted multiple times this session, mitigated by
  `applyReward` reusing the exact same `daysAgo`/`hasGumpaPlus` conditions
  already confirmed correct via `currentStreak`, differing only in a
  trivial, visually-inspectable reset-vs-increment branch.
- Test user and both local dev servers cleaned up afterward.
- `npx tsc --noEmit` clean.

## Roadmap complete (2026-08-13)

All six phases shipped: token UI redesign, cosmetic flare, the activity
calendar, exclusive/early-access challenges, the earn multiplier, and
streak protection. Combined with the Store (a separate revenue stream) and
the redemption backend from earlier in this session, the Gumpa+ bundle
described in `docs/rewards-economy-plan.md` is now fully built — everything
that can exist before real subscribers do. What's left is entirely the
business/billing side tracked in `docs/gumpa-plus-billing-roadmap.md`
(LLC/EIN done; bank account, RevenueCat, and the App Store/Play Console
products still open) — no more app code is blocking a launch.
