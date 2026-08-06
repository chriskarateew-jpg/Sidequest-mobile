# Live-Volume Audit Prompt

This is a standing prompt for re-running the "can Gumpa survive real traffic"
analysis as the codebase evolves. Feed this whole file to a fresh Claude
session (or run it yourself) whenever you want `docs/Live-Volume.md`
refreshed — after adding a new endpoint, before a public launch push, or any
time usage jumps. It's a checklist, not a one-shot report: rerun it, don't
just reread the old output.

This prompt is also the **only** thing responsible for keeping
`docs/live-volume-checklist.md` (the fix-tracking file `/live-volume-fix`
works from) in sync with the findings here — see step 9. The checklist does
not update itself; if you run this prompt and skip that step, the tracker
silently goes stale.

## Why this exists

Gumpa has been exercised by one person (the developer) doing manual QA. It is
about to become a public-facing app (see AGENTS.md "Product scope" — treat
every user as untrusted and every feature as public-facing). Manual testing
by one user tells you nothing about what happens when a few hundred strangers
use it at once. This prompt exists to keep re-answering: at what point does
each part of the stack bend or break, and what's the actual dollar cost of
running it for real.

## What to actually do

Don't guess or reuse memorized numbers from a previous run — the codebase
changes fast. Re-derive every claim from the current source:

1. **Inventory every server route.** Read `server/src/index.ts` top to bottom
   and list each endpoint with: method, whether `requireAuth`/`requireDeveloper`
   gates it, and whether `checkRateLimit` (see `server/src/ratelimit.ts`)
   guards it. Flag every endpoint with no rate limit at all, especially reads
   (feed listing, photo serving, search, group/pot/duel reads) and cheap-looking
   writes (kudos toggle, friend request, group join) — those are the ones a
   script can hammer for free.

2. **Find every outbound API call the server makes** and note who's paying
   for it and what its own volume ceiling is:
   - Anthropic (`server/src/verify.ts`, `server/src/local-challenges.ts`) —
     model, `max_tokens`, how often it's called per user action, and whether
     it's cached (local-challenges is cached per region+week; verify is not
     and can't be, it's per-submission).
   - Nominatim / Wikipedia / Wikimedia Commons (`server/src/city-image.ts`) —
     free, unauthenticated, rate-limited by the *provider's* usage policy
     (Nominatim: ~1 req/sec, proper User-Agent required), and shared across
     every Worker on Cloudflare's IP ranges, not just this app.
   - Overpass (`server/src/places.ts`) — same free/no-key/shared-IP profile.
   - Resend (`server/src/email.ts`) — transactional email, has its own
     sending-volume tier.
   Pull current pricing via the `claude-api` skill (don't hardcode remembered
   numbers — they change) and estimate $/action and $/day at the traffic
   levels in step 4.

3. **Check Cloudflare resource usage against the account's actual plan.**
   Read `server/wrangler.toml` for bindings (D1/R2/KV) but note that
   **the binding list doesn't say which pricing tier applies** — that's set
   by whether the account is on Workers Free or Workers Paid ($5/mo), which
   isn't visible from the repo. Explicitly call this out as an open question
   for the user to confirm (Cloudflare dashboard → Workers & Pages → Plans),
   don't assume. Model both scenarios:
   - **Free plan:** ~100k requests/day, 10ms CPU time/request, D1 5GB storage
     + 5M rows read/day + 100k rows written/day, KV 100k reads/day + **1,000
     writes/day** + 1GB storage, R2 10GB storage + 1M Class A + 10M Class B
     ops/month (R2 has no egress fee on any plan).
   - **Paid plan ($5/mo base):** no daily request cap (billed per-request past
     10M/month), CPU time up to 30s/request (configurable), D1/KV daily caps
     replaced with much larger monthly-included amounts plus metered overage.
   Cross-reference against `server/src/ratelimit.ts`'s `checkRateLimit`: it
   does a KV read *and* (on every allowed call) a KV write — so every
   rate-limited action (login, signup, verify, complete, comment, recommend,
   rewards-interest, local-challenges-gen) costs one KV write. Compute how
   many real users' worth of daily activity exhausts the free-tier KV write
   quota, and separately the D1 write quota.

4. **Model concrete request volume**, not just abstract limits. Pick 2-3
   scenarios (e.g. 100 / 500 / 2,000 daily active users) and estimate, per
   scenario: verify calls/day, complete calls/day, feed reads/day, photo
   views/day, login/day. Multiply against the per-unit costs and quotas from
   steps 2-3 to find which resource is exhausted first at each scale. State
   the answer as "the first wall you hit is X, at approximately Y users,
   because Z" — not a wall of raw numbers.

5. **Audit CPU-time-per-request hotspots**, since Workers bills/limits on
   wall CPU time, not just request count:
   - `server/src/crypto.ts`'s `hashPassword` — PBKDF2 100,000 iterations on
     every login/signup. Check whether this still fits inside whatever the
     account's actual CPU-time-per-request ceiling is (this is a strong
     signal the account is *already* on Workers Paid — free tier's ~10ms
     would not survive this, per the comment in `photo-hash.ts`; confirm with
     the user rather than asserting).
   - `server/src/photo-hash.ts`'s `findDuplicateHash` — full-scans the most
     recent `RECENT_HASHES_LIMIT` (currently 5000) rows and computes a Hamming
     distance against every one, on every single photo submission. The file's
     own comment already flags this as a "revisit if this table grows large"
     compromise — check the current row count in production D1
     (`SELECT COUNT(*) FROM photo_hashes`) and estimate how many more months
     of usage before this becomes the dominant per-submission cost.
   - The `@jsquash/jpeg` WASM decode in the same file — cheap today because it
     only decodes a 9x8 thumbnail, but confirm no code path has grown to feed
     it a full-size image since the last audit.

6. **Audit photo/media handling for volume and privacy implications**:
   - `server/src/feed.ts`'s `handleGetPhoto` proxies every photo request
     through the Worker with no auth check — confirm whether that's still
     true, and whether a private account's photo URL (if ever leaked/shared)
     is fetchable by anyone who has the URL, bypassing the friends-only feed
     gate. This is a real privacy gap given AGENTS.md's "quest photos are
     real people's real-time proof content — treat as sensitive."
   - Confirm whether Cloudflare's edge cache actually caches these responses
     (the `cache-control: public, max-age=31536000, immutable` header alone
     doesn't guarantee edge caching for a Workers response on a bare
     `workers.dev` domain — check whether the API is served behind a custom
     domain with cache rules, or whether every photo view re-hits R2 + Worker
     CPU every time).
   - No server-side max upload size check on `photoBase64` in `verify.ts` or
     `complete.ts` — confirm whether one has been added, and if not, what
     happens today with a deliberately huge image (Worker request body limit,
     Anthropic's own per-image size limit, or an unhandled failure mode).

7. **Security/abuse surface at public scale** (cross-check against
   AGENTS.md's "Product scope" section, which already names moderation,
   reporting, and blocking as a gap):
   - Confirm the public feed still has no report/block/moderation mechanism,
     and note what a stranger could post to it unmoderated today.
   - Confirm which endpoints trust client-supplied data without server-side
     validation (re-check `complete.ts`'s caption/rating normalization,
     `local-challenges.ts`'s generation trigger, any new endpoint added since
     the last audit).
   - Re-check `server/src/auth.ts`'s rate limits (signup, login, resend,
     reset) are still present and reasonable given current signup volume.
   - Note any admin (`/admin/*`) endpoint that changed and confirm it's still
     gated by `requireDeveloper`, not just an unauthenticated route that
     happens to look internal.

8. **Write/update `docs/Live-Volume.md`** with these sections: Current
   Architecture Snapshot (one paragraph), Volume Capacity Estimate (the
   scenario table from step 4, with the "first wall" conclusion up front),
   Cost Model (Anthropic + Cloudflare, both plan scenarios), Security/Abuse
   Gaps (ranked by real-world impact, not by how interesting they are),
   Known Bottlenecks (the CPU-time and full-scan items from step 5), and a
   short Recommendations list ordered by "cheapest fix for the nearest wall"
   first. Date the report at the top and note what changed since the last
   version if one exists.

9. **Reconcile `docs/live-volume-checklist.md` against the refreshed
   Recommendations list.** This is not optional — skipping it is exactly how
   the tracker and the findings drift apart. The checklist is organized into
   numbered phases (see its own header for what each currently means —
   roughly: facts to establish, the nearest infrastructure wall, code-level
   security/abuse fixes, low-urgency housekeeping, and a deferred-projects
   phase for anything too big for a single checkbox). Diff the new
   Recommendations list against the checklist's current items and handle
   each case:
   - **A recommendation is new** (wasn't in the previous version) → add a new
     `LV-N` item (next unused number) in the checklist's own format (Why /
     Acceptance criteria / Verification / Log), placed in whichever existing
     phase it fits best by nature (a fact-finding item goes in the facts
     phase, a code fix in the security/fixes phase, etc.) — or propose a new
     phase if it genuinely doesn't fit any existing one, rather than forcing
     it. Add its checkbox to the "Progress at a glance" section, unchecked.
   - **A recommendation still exists and matches an existing `LV-N` item** →
     leave its status and checkbox alone (don't reset progress), but move it
     to a different phase if the new report's reasoning puts it there now,
     and append a one-line log entry noting the audit re-confirmed it (with
     the date).
   - **A recommendation is gone** (the new report no longer lists it) →
     don't delete the `LV-N` item outright. If its status was already
     `VERIFIED` (checkbox already checked), leave it as historical record. If
     it was still open, check why it dropped: either the underlying problem
     was actually resolved by other work (mark `VERIFIED`, check its box, and
     note what resolved it) or the new report's scope just changed (note that
     too) — never let an item silently disappear without a log entry saying
     what happened to it.
   - **The nearest wall changed** (e.g. LV-0/LV-1 in the current checklist —
     confirming the Cloudflare plan directly changes which item is most
     urgent) → re-order or re-phase items as needed so the phase structure
     still reflects "most urgent first," don't just leave stale items in
     their original phase once the reasoning behind that placement changes.
   State explicitly, in your final summary, whether the checklist needed any
   changes this run or was already in sync.

## Ground rules for whoever runs this

- Don't invent Cloudflare or Anthropic pricing/limits from memory if they
  might have changed — use the `claude-api` skill for Anthropic pricing, and
  say explicitly when a Cloudflare limit is being stated from general
  knowledge and should be double-checked against the current Cloudflare
  pricing page.
- Don't present free-tier assumptions as fact — the account's actual plan is
  the single biggest variable in this whole analysis and it isn't visible
  from the repo. Ask, don't assume, and mark every quote that depends on it.
- Ground every finding in an actual file/line, the same way the rest of this
  codebase's comments do — "verify.ts calls Haiku per submission, uncached"
  beats "the AI feature might get expensive."
- This app is a solo personal project moving fast (see AGENTS.md "Working
  style") — recommendations should be ranked by effort vs. how soon the wall
  gets hit, not an exhaustive enterprise readiness checklist.
