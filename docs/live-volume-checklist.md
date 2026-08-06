# Live-Volume Fix Checklist

Tracks every finding in `docs/Live-Volume.md` §6 (Recommendations) through to
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

### Phase 2 — Infrastructure decision (this is the nearest real wall)
- [ ] **LV-1** — Upgrade to Workers Paid, or explicitly decide to stay on Free and design around the ~140-DAU KV-write ceiling

### Phase 3 — Security & abuse fixes (code)
- [ ] **LV-2** — Auth/visibility check on `handleGetPhoto`
- [ ] **LV-3** — Rate-limit unauthenticated public endpoints
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

**Why:** Every capacity/cost estimate in `Live-Volume.md` (§2, §4) depends on
this, and it isn't visible from the repo.

**Answer:** **Free plan**, confirmed directly by the user, 2026-08-06.

**What this means in practice:** the KV-write ceiling described in
`Live-Volume.md` §2 is real, not a hypothetical — roughly **140 daily active
users** worth of ordinary activity (login + a few photo verifies/completes
each) before `checkRateLimit`'s KV writes (`server/src/ratelimit.ts`) start
hitting the free tier's 1,000-writes/day cap. That makes Phase 2 (LV-1) the
most urgent item on this whole list, ahead of the code-level security fixes
in Phase 3 — a security fix doesn't matter much if rate limiting itself
silently breaks first.

**Log:**
- 2026-08-05 — item created from `Live-Volume.md` §6.1.
- 2026-08-06 — Answered: Free plan. Marked `VERIFIED`. Flagged LV-1 as the
  top-priority next item as a direct consequence.

---

## Phase 2 — Infrastructure decision

### LV-1 — Upgrade to Workers Paid, or design around Free

**Status:** TODO

**Why:** With the account confirmed on Free (LV-0), the ~140-DAU KV-write
wall in `Live-Volume.md` §2 is an active constraint, not a someday-maybe.
Cost-wise this is a $5/month decision against re-engineering the rate
limiter to use fewer KV writes per user action — upgrading is almost
certainly the cheaper option for a solo project moving fast (AGENTS.md
"Working style"), but it's a billing decision only the user can make.

**Acceptance criteria:** One of:
- The Cloudflare account is upgraded to Workers Paid ($5/mo), confirmed in
  the dashboard, **or**
- The user explicitly decides to stay on Free for now, in which case this
  item's job becomes making that a *safe* choice — e.g. reducing how many
  rate-limited actions burn a KV write per user, raising the free ceiling
  meaningfully above 140 DAU before this gets revisited.

**Verification:** N/A for the upgrade path — a billing action taken by the
user in the Cloudflare dashboard, not something this repo's code can verify.
This is a production-affecting, recurring-cost decision — `/live-volume-fix`
should ask for explicit confirmation of which path was chosen, never assume.

**Log:**
- 2026-08-05 — item created from `Live-Volume.md` §6.2 (originally
  conditional on LV-0's answer).
- 2026-08-06 — LV-0 confirmed Free plan, so this item is now active and
  promoted to the top of the queue.

---

## Phase 3 — Security & abuse fixes (code)

### LV-2 — Auth/visibility check on `handleGetPhoto`

**Status:** TODO

**Why:** `server/src/feed.ts`'s `handleGetPhoto` currently serves any photo
key to any request with no auth check at all, bypassing the
friends-only/public visibility rule the feed query enforces. Real privacy
gap per AGENTS.md's "quest photos are sensitive by default."

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
- 2026-08-05 — item created from `Live-Volume.md` §6.3.

---

### LV-3 — Rate-limit unauthenticated public endpoints

**Status:** TODO

**Why:** `/feed/public` and `/photos/:key` (and, more broadly, `/users/search`,
kudos toggle, group/pot/duel reads) have no `checkRateLimit` call at all —
reachable with zero account and zero cost to an attacker, per
`Live-Volume.md` §5.3. Doubly relevant now that KV write budget is confirmed
scarce (LV-0/LV-1) — an unthrottled endpoint being hammered wastes Worker
requests and D1 reads, but at least doesn't burn the same tight KV quota
`checkRateLimit` itself depends on, so this doesn't need to wait on LV-1.

**Acceptance criteria:** At minimum, `/feed/public` and `/photos/:key` get a
per-IP rate limit via the existing `checkRateLimit`/`clientIp` helpers in
`server/src/ratelimit.ts`, following the same pattern already used for
`signup`/`login`. Re-check at implementation time whether the other
unauthenticated/cheap endpoints named in `Live-Volume.md` §5.3 still lack a
limit and are worth including in the same pass — don't silently expand scope
without noting it in the log below.

**Verification:** Confirm the limit actually triggers — script N+1 requests
against the limited endpoint locally and confirm the (N+1)th gets a 429, not
just that the code compiles.

**Log:**
- 2026-08-05 — item created from `Live-Volume.md` §6.4.

---

### LV-4 — Size cap on `photoBase64` uploads

**Status:** TODO

**Why:** No client- or server-side max size check before a submitted photo
is decoded or forwarded to Anthropic (`verify.ts`, `complete.ts`) — an
oversized upload today fails as a generic 502 after CPU/bandwidth is already
spent, per `Live-Volume.md` §4.

**Acceptance criteria:** A clearly-oversized `photoBase64` is rejected with a
specific client-facing error (not a passthrough 502 from the Anthropic call)
before any decode or outbound fetch happens. Pick a size ceiling generous
enough for a real phone photo at the app's current capture settings (JPEG
quality 0.5, no resolution cap per `src/lib/photo.ts`) but well under
whatever Workers' own request-body limit and Anthropic's per-image limit are
— confirm both those numbers at implementation time rather than guessing.

**Verification:** Submit a deliberately oversized payload locally and
confirm the new, specific error — not the old generic 502 — is what comes
back.

**Log:**
- 2026-08-05 — item created from `Live-Volume.md` §6.5.

---

## Phase 4 — Housekeeping & monitoring

### LV-5 — Document `photo_hashes` full-scan revisit trigger

**Status:** TODO

**Why:** `findDuplicateHash` in `server/src/photo-hash.ts` full-scans up to
5,000 rows per photo submission — fine today, a slow-burn cost as the table
grows, already flagged in the file's own comment. Not urgent; this item is
about making sure it doesn't get forgotten, not fixing it now.

**Acceptance criteria:** A concrete row-count trigger (e.g. 20k-50k rows) is
recorded — either as a code comment near `RECENT_HASHES_LIMIT` in
`photo-hash.ts`, or as a follow-up item in this checklist — with a note on
what the fix would look like (index, shard, or a cheaper approximate check)
when that trigger is hit. Actually rewriting the dedup logic now is out of
scope for this item.

**Verification:** N/A beyond confirming the note/comment is in place and
legible to a future session.

**Log:**
- 2026-08-05 — item created from `Live-Volume.md` §6.6.

---

### LV-6 — Check Anthropic account rate-limit tier before launch

**Status:** TODO

**Why:** Aggregate Haiku cost isn't a concern (`Live-Volume.md` §3), but a
low-usage account's per-minute rate limit could throttle a synchronized
burst (e.g. many users hitting a midnight streak reset at once).

**Acceptance criteria:** Current tier/RPM/TPM limits for the account are
checked in the Anthropic console and recorded here, with a judgment call on
whether they're adequate for the volume expected at launch.

**Verification:** N/A — a console lookup, not a code change.

**Log:**
- 2026-08-05 — item created from `Live-Volume.md` §6.7.

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
- 2026-08-05 — item created from `Live-Volume.md` §6.8, marked `DEFERRED`
  from the start since it doesn't fit the one-item-per-run model this
  checklist is built around.
