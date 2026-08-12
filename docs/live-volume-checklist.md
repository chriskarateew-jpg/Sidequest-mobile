# Live-Volume Fix Checklist

Tracks every finding in `docs/Live-Volume.md` §7 (Recommendations) through to
a verified fix, organized into phases you can literally check off. Driven by
`/live-volume-fix` (`.claude/skills/live-volume-fix/SKILL.md`), which works
straight down this list — phase by phase, top to bottom within a phase — one
item per run: re-investigate → fix → verify → check the box.

**The workflow:** run the audit prompt (`docs/live-volume-audit-prompt.md`)
to refresh `docs/Live-Volume.md` and sync this file with it, then run
`/live-volume-fix` repeatedly to burn down the boxes below.

A box only gets checked once an item is genuinely `VERIFIED` (see each
item's own section for what that means) — not just attempted. `DEFERRED`
items are shown but intentionally skipped by `/live-volume-fix` — see Phase 5.

---

## Progress at a glance

### Phase 1 — Facts established
- [x] **LV-0** — Confirm Cloudflare Workers plan
- [ ] **LV-8** — Check whether Workers CPU-time limit is already breaking auth in production (new 2026-08-07 — most urgent item on this list, ahead of LV-1)

### Phase 2 — Infrastructure decision (this is the nearest scaling wall)
- [ ] **LV-1** — Upgrade to Workers Paid, or explicitly decide to stay on Free and design around the ~87-DAU KV-write ceiling

### Phase 3 — Security & abuse fixes (code)
- [ ] **LV-2** — Auth/visibility check on `handleGetPhoto`
- [ ] **LV-3** — Rate-limit unauthenticated/cheap endpoints (scope expanded 2026-08-07)
- [ ] **LV-4** — Size cap on `photoBase64` uploads

### Phase 4 — Housekeeping & monitoring
- [ ] **LV-5** — Document `photo_hashes` full-scan revisit trigger
- [ ] **LV-6** — Check Anthropic account rate-limit tier before launch

### Phase 5 — Deferred (its own future project — not part of this loop)
- [ ] **LV-7** — Moderation / report / block tooling

---

## Phase 1 — Facts established

### LV-0 — Confirm Cloudflare Workers plan

**Status:** VERIFIED

**Why:** Every capacity/cost estimate in `Live-Volume.md` depends on this,
and it isn't visible from the repo.

**Answer:** **Free plan**, confirmed directly by the user, 2026-08-06 (and
re-confirmed as still current, 2026-08-07 rerun).

**What this means in practice:** the KV-write ceiling in `Live-Volume.md` §3
is real, not hypothetical — recalculated this run at roughly **87 daily
active users** (down from the previous ~140 estimate, now that a fuller
route inventory shows more actions burn a KV write than previously modeled)
before `checkRateLimit`'s KV writes (`server/src/ratelimit.ts`) exceed the
free tier's 1,000-writes/day cap. Confirming Free also flipped the read on
LV-8 below: PBKDF2's presence in the codebase used to be read as evidence
the account was *probably* already on Paid; now that Free is confirmed,
that reasoning is void and LV-8 is an open, urgent question instead of a
reassuring signal.

**Log:**
- 2026-08-05 — item created from `Live-Volume.md` §6.1 (previous version).
- 2026-08-06 — Answered: Free plan. Marked `VERIFIED`.
- 2026-08-07 — Audit rerun re-confirmed this is still the answer; no change
  needed. Recalculated the downstream KV-write DAU estimate (~140 → ~87)
  now that the route inventory found more rate-limited actions than the
  first pass had modeled. Also surfaced that this fact, combined with the
  PBKDF2 finding, produces a new urgent item — see LV-8.

---

### LV-8 — Check whether Workers CPU-time limit is already breaking auth in production

**Status:** TODO — **most urgent item on this checklist**

**Why:** `server/src/crypto.ts:16-21` runs PBKDF2-SHA256 at 100,000
iterations on every login, signup, and password-reset completion
(`auth.ts:76,109,319,322` — the reset-completion path runs it *twice* in
one request). Workers Free caps CPU time at **10ms per invocation**
(confirmed live against Cloudflare's current pricing page this run). The
previous audit used PBKDF2's presence as evidence the account was probably
already on Paid, reasoning that Free's 10ms ceiling "would struggle to fit"
it — but LV-0 now confirms the account **is** on Free, which inverts that
reasoning entirely. Whether native `crypto.subtle.deriveBits` fits inside
10ms of billed Workers CPU time is not something this audit can determine
from the repo alone. If it doesn't fit, **every login and signup attempt
could be failing in production right now**, independent of how many users
there are — this is not a scaling problem, it's a "is this already broken"
problem, which is why it jumps ahead of LV-1 despite LV-1 being the
previously-top-priority item.

**Acceptance criteria:** Check the Cloudflare dashboard's Workers Logs /
Errors (or `wrangler tail` against the deployed Worker) for `/auth/login`
and `/auth/signup` and confirm whether "Exceeded CPU Limit" (or equivalent)
errors are present. Record the answer here. If errors are present, this
becomes a P0 production incident, not a checklist item — surface it to the
user immediately rather than continuing down this list. If no errors are
present, PBKDF2 is fitting inside 10ms in practice (native crypto is faster
than the JS-loop mental model this concern was originally based on) and this
item can be marked `VERIFIED` with that finding recorded.

**Verification:** The dashboard/log check itself is the verification — no
code change is implied by this item alone (that's LV-1, if the answer is
"yes, it's broken" or "it's fine but let's remove the CPU-time risk
anyway"). Do not mark this item done based on reasoning alone ("PBKDF2
*should* be fast enough") — the whole point is that this is unverifiable
from the repo and needs a real log check.

**Log:**
- 2026-08-07 — item created. Surfaced by this run's audit as a direct
  consequence of LV-0's answer flipping the interpretation of the PBKDF2
  finding from reassuring to urgent-unknown. Not yet checked.

---

## Phase 2 — Infrastructure decision

### LV-1 — Upgrade to Workers Paid, or design around Free

**Status:** TODO

**Why:** With the account confirmed on Free (LV-0), the KV-write wall in
`Live-Volume.md` §3 is an active constraint, not a someday-maybe — and this
run's recalculation puts it at **~87 DAU**, lower than the previous ~140
estimate. Cost-wise this is a $5/month decision against re-engineering the
rate limiter to use fewer KV writes per user action; upgrading is almost
certainly the cheaper option for a solo project moving fast (AGENTS.md
"Working style"), and this run's audit adds a second independent reason to
upgrade: it would also remove whatever CPU-time risk LV-8 turns up, since
Paid's CPU ceiling (30s default, up to 5min) makes PBKDF2-100k a complete
non-issue. This is a billing decision only the user can make.

**Acceptance criteria:** One of:
- The Cloudflare account is upgraded to Workers Paid ($5/mo), confirmed in
  the dashboard, **or**
- The user explicitly decides to stay on Free for now, in which case this
  item's job becomes making that a *safe* choice — e.g. reducing how many
  rate-limited actions burn a KV write per user, raising the free ceiling
  meaningfully above ~87 DAU before this gets revisited. (If staying on
  Free, LV-8's answer becomes load-bearing — a CPU-time problem can't be
  "designed around" the way a KV-write problem can.)

**Verification:** N/A for the upgrade path — a billing action taken by the
user in the Cloudflare dashboard, not something this repo's code can verify.
This is a production-affecting, recurring-cost decision — `/live-volume-fix`
should ask for explicit confirmation of which path was chosen, never assume.

**Log:**
- 2026-08-05 — item created from `Live-Volume.md` §6.2 (previous version;
  originally conditional on LV-0's answer).
- 2026-08-06 — LV-0 confirmed Free plan, so this item became active and was
  promoted to the top of the queue.
- 2026-08-07 — Audit rerun re-confirmed this item is still open and still
  the right call, and recalculated its urgency: the KV-write wall moved
  from ~140 to ~87 DAU, and a second, independent reason to upgrade
  (removing PBKDF2 CPU-time risk) was added. Still `TODO`. Re-phased behind
  the newly-added LV-8 in the progress list, since LV-8 is a 5-minute fact
  check that should happen first and may itself argue for treating this as
  more urgent than a routine billing decision.

---

## Phase 3 — Security & abuse fixes (code)

### LV-2 — Auth/visibility check on `handleGetPhoto`

**Status:** TODO

**Why:** `server/src/feed.ts`'s `handleGetPhoto` currently serves any photo
key to any request with no auth check at all, bypassing the
friends-only/public visibility rule the feed query enforces. Real privacy
gap per AGENTS.md's "quest photos are sensitive by default." Confirmed
unchanged by this run's dedicated photo-handling audit — the function still
doesn't even accept a `Request` object, so it's structurally incapable of
checking who's asking.

**Acceptance criteria:** `/photos/:key` only serves a photo if the requester
is allowed to see the post it belongs to — the post's owner, a friend (if
the post is friends-scoped), or anyone (if the owning account is public and
the post is public-feed-eligible) — using the same rule `handleListFeed`
already applies. An unauthorized request gets a 404 (matching this
codebase's existing pattern of not distinguishing "forbidden" from "doesn't
exist" — see `requireDeveloper`'s comment in `auth.ts`), not a 401/403 that
confirms the photo exists.

**Verification:** Exercise both a positive and negative case against a real
running instance (local dev server is fine — no production data needed):
fetch a photo you're allowed to see (succeeds), then fetch a private
account's photo as an unrelated user or logged out (fails). Use the
`run-gumpa-mobile` skill or a direct `curl`/fetch against a local `wrangler
dev` instance. Typecheck passing is not sufficient verification here — this
is exactly the kind of runtime-behavior bug that only shows up when
exercised.

**Log:**
- 2026-08-05 — item created from `Live-Volume.md` §6.3 (previous version).
- 2026-08-07 — Audit rerun re-confirmed this finding is unchanged: still no
  auth check, still no `Request` parameter on the handler. Still `TODO`.

---

### LV-3 — Rate-limit unauthenticated/cheap endpoints

**Status:** TODO

**Why:** `/feed/public` and `/photos/:key` (and, more broadly, `/users/search`,
kudos toggle, group/pot/duel reads) have no `checkRateLimit` call at all —
reachable with zero account and zero cost to an attacker. This run's full
route inventory (all ~50 endpoints, not a sample) found the unrated-limited
surface is substantially larger than previously documented — see the
expanded list below. Doubly relevant now that KV write budget is confirmed
even scarcer than last thought (LV-0/LV-1) — an unthrottled endpoint being
hammered wastes Worker requests and D1 reads, but at least doesn't burn the
same tight KV quota `checkRateLimit` itself depends on, so this doesn't need
to wait on LV-1.

**Acceptance criteria:** At minimum, `/feed/public` and `/photos/:key` get a
per-IP rate limit via the existing `checkRateLimit`/`clientIp` helpers in
`server/src/ratelimit.ts`, following the same pattern already used for
`signup`/`login`. **Expanded scope from this run's audit** — re-check at
implementation time and prioritize by realistic abuse angle, not just
completeness:
  - Zero-account-reachable reads: `/feed/public`, `/photos/:key` (highest priority — no account needed at all)
  - Token-economy writes with no auth-adjacent throttle: `/groups/:id/pots` (create — debits tokens), `/pots/:id/join` (stakes tokens) — flagged this run as having a plausible abuse angle beyond wasted CPU, worth prioritizing above the read-only list
  - Everything else newly found unlimited this run: `/posts/mine`, `/posts/:id/comments` (read), `/friends`, `/friends/request`, `/friends/respond`, `/groups`, `/groups/:id`, `/groups/join`, `/pots/:id` (read), `/duels`, `/duels/:id/accept|decline|cancel`, `/tokens/me`, `/challenges/custom`, `/boosts/active`, `/timed-challenges`, `/account/avatar` (R2 write), `/account/privacy`, `/auth/me`, `/posts/:id/kudos`, `/posts/:id` (DELETE)
  - Also newly found: `/auth/reset-password` (the completion step, not the request step) has no rate limit — lower priority given 192-bit token entropy makes brute force infeasible, but inconsistent with `handleRequestPasswordReset` which is limited
  Don't silently expand scope beyond what's implemented without noting it in
  the log below.

**Verification:** Confirm the limit actually triggers — script N+1 requests
against the limited endpoint locally and confirm the (N+1)th gets a 429, not
just that the code compiles.

**Log:**
- 2026-08-05 — item created from `Live-Volume.md` §6.4 (previous version).
- 2026-08-07 — Audit rerun ran a complete route inventory (previously only
  a partial list had been checked) and found the unrated-limited surface is
  much larger than documented: essentially every "cheap write" in the app
  (friend requests, group/pot joins, duels, avatar upload, kudos, etc.) has
  no rate limit, plus two token-economy endpoints (`/groups/:id/pots`
  create, `/pots/:id/join`) that weren't previously flagged and have a
  plausible abuse angle. Also found `/auth/reset-password` completion step
  has no limit (low severity, token entropy mitigates). Expanded this
  item's acceptance criteria accordingly. Still `TODO` — scope grew, but
  this remains one recommendation, not split into multiple LV items, since
  it's the same underlying gap (missing rate limiting) applied broadly.

---

### LV-4 — Size cap on `photoBase64` uploads

**Status:** TODO

**Why:** No client- or server-side max size check before a submitted photo
is decoded or forwarded to Anthropic (`verify.ts`, `complete.ts`) — an
oversized upload today fails as a generic error after CPU/bandwidth is
already spent. Confirmed unchanged by this run's dedicated audit, including
the specific decode path with no size guard: `base64ToBytes`
(`server/src/http.ts:29-34`) and `safeJson` (`http.ts:21-27`) both process
the payload with no length check at any point.

**Acceptance criteria:** A clearly-oversized `photoBase64` is rejected with a
specific client-facing error (not a passthrough error from the Anthropic
call) before any decode or outbound fetch happens. Pick a size ceiling
generous enough for a real phone photo at the app's current capture settings
(JPEG quality 0.5, no resolution cap, confirmed this run in
`src/lib/photo.ts:74,95`) but well under whatever Workers' own request-body
limit and Anthropic's per-image limit are — confirm both those numbers at
implementation time rather than guessing.

**Verification:** Submit a deliberately oversized payload locally and
confirm the new, specific error — not the old generic failure — is what
comes back.

**Log:**
- 2026-08-05 — item created from `Live-Volume.md` §6.5 (previous version).
- 2026-08-07 — Audit rerun re-confirmed this finding is unchanged, and
  additionally confirmed the client-side capture settings that determine
  what "a real phone photo" means for sizing this cap (quality 0.5, no
  resolution cap — same as assumed in the original report, now verified
  rather than assumed). Still `TODO`.

---

## Phase 4 — Housekeeping & monitoring

### LV-5 — Document `photo_hashes` full-scan revisit trigger

**Status:** TODO

**Why:** `findDuplicateHash` in `server/src/photo-hash.ts` full-scans up to
5,000 rows per photo submission — fine today, a slow-burn cost as the table
grows. Not urgent; this item is about making sure it doesn't get forgotten,
not fixing it now.

**Acceptance criteria:** A concrete row-count trigger (e.g. 20k-50k rows) is
recorded — either as a code comment near `RECENT_HASHES_LIMIT` in
`photo-hash.ts`, or as a follow-up item in this checklist — with a note on
what the fix would look like (index, shard, or a cheaper approximate check)
when that trigger is hit. Actually rewriting the dedup logic now is out of
scope for this item.

**Verification:** N/A beyond confirming the note/comment is in place and
legible to a future session.

**Log:**
- 2026-08-05 — item created from `Live-Volume.md` §6.6 (previous version).
- 2026-08-07 — Audit rerun re-read the file: a general scaling-aware
  comment already exists (`"full-scan is cheap at current app scale;
  revisit (index/shard) if this table grows large"`, `photo-hash.ts:33`
  area) plus separate file-header prose about the Workers CPU-time risk —
  but neither names a concrete row-count number, so this item's acceptance
  criteria (a *specific* trigger like 20k-50k) is still unmet. Still
  `TODO`, but noting the partial groundwork already in place.

---

### LV-6 — Check Anthropic account rate-limit tier before launch

**Status:** TODO

**Why:** Aggregate Haiku cost isn't a concern (`Live-Volume.md` §4), but a
low-usage account's per-minute rate limit could throttle a synchronized
burst (e.g. many users hitting a midnight streak reset at once).

**Acceptance criteria:** Current tier/RPM/TPM limits for the account are
checked in the Anthropic console and recorded here, with a judgment call on
whether they're adequate for the volume expected at launch.

**Verification:** N/A — a console lookup, not a code change.

**Log:**
- 2026-08-05 — item created from `Live-Volume.md` §6.7 (previous version).
- 2026-08-07 — Audit rerun did not re-check this (console lookup is outside
  what a codebase audit can verify) — carried over unchanged, still `TODO`,
  still open.

---

## Phase 5 — Deferred

### LV-7 — Moderation / report / block tooling

**Status:** DEFERRED

This is a real gap (already named in AGENTS.md's "Product scope" section)
but it's a genuine feature project — report flow, block relationships, a
moderation queue/admin view, takedown handling — not a single fixable item.
`/live-volume-fix` should never attempt a partial version of this. When it's
time to pick this up, break it into its own checklist (mirroring this file's
format) or a proper plan via `EnterPlanMode`, rather than folding it into
this one.

**Log:**
- 2026-08-05 — item created from `Live-Volume.md` §6.8 (previous version),
  marked `DEFERRED` from the start since it doesn't fit the one-item-per-run
  model this checklist is built around.
- 2026-08-07 — Audit rerun re-confirmed the gap is still real and unchanged:
  no report/block/moderation table or logic exists anywhere in the server,
  and `comments.ts`'s own file-header comment still calls this out directly.
  Remains `DEFERRED`, no change.
