# Live-Volume Report

**Generated:** 2026-08-07 (second run of `docs/live-volume-audit-prompt.md`; previous version dated 2026-08-05).
**What changed since the last run:** the open question from the last report — which Cloudflare plan the account is on — is now confirmed (**Workers Free**, per the user, 2026-08-07). That answer surfaces a sharper, more urgent finding than last time's headline: the previous report treated PBKDF2-100k-iterations-in-production as *evidence* the account was probably already on Paid (because Free's ~10ms CPU-time ceiling "would struggle to fit" it). Now that Free is confirmed, that reasoning inverts — it's a live open question whether login/signup are already erroring in production, not a reassuring signal. See §6 for why this jumps to the top of the list. The KV-write wall is also recalculated slightly lower (~87 DAU vs. the previous ~140 estimate) now that a fuller route inventory shows more actions burn a KV write than previously modeled (comments, local-challenges fetches, rewards-interest checks all write, not just login/verify/complete).

**Update, 2026-08-12 (not a full audit rerun):** `server/src/local-challenges.ts` and `server/src/places.ts` were substantially rewritten this date — local-challenge matching moved from a per-~1km-region, weekly-regenerated batch to a long-lived, distance-based `venue_pool` shared across nearby users (see the commit "Replace grid-cell venue matching with a distance-based shared pool"). §1, §4, and §6 below have been corrected where they described the old per-region model. Everything else in this report — the KV-write wall, the PBKDF2/CPU question, §5's security gaps, §7's recommendations — was **not** re-verified as part of this update and should still be treated as dated 2026-08-07.

## tl;dr

Two walls, and they're both nearer than "real public launch" scale — this app cannot safely stay on Workers Free through any meaningful growth:

1. **Possibly already hit, independent of traffic volume:** PBKDF2 (100,000 iterations, SHA-256) runs on every login and signup (`server/src/crypto.ts:16-21`, called from `server/src/auth.ts:76,109,319,322`). Workers Free caps CPU time at **10ms per invocation**. Whether PBKDF2-100k fits under that is genuinely unknown without checking — **check the Cloudflare dashboard's Workers error logs for "Exceeded CPU Limit" on `/auth/login` and `/auth/signup` before anything else in this report.**
2. **Hit at roughly 87 daily active users if not:** `checkRateLimit` (`server/src/ratelimit.ts:12-19`) does one KV read and one KV write on every allowed call to any of 9 rate-limited actions (login, signup, resend-verify, reset-request, verify, complete, comment, local-challenges, local-challenges-gen, rewards-interest, recommend). Free plan's KV write cap is 1,000/day. An ordinary active user (login + a couple verifies/completes + a few comments + a session's worth of local-challenge fetches) burns roughly 11-12 KV writes/day, so **~87 such users exhausts the daily write quota** — see §3 for the arithmetic.

Everything else audited this run (D1, R2, Anthropic Haiku spend) has comfortable headroom into the thousands of DAU on Free. Haiku cost specifically is **still not a concern** — a few dollars a month at hundreds of users, scaling linearly with no cliff.

**Action items #1 and #2, before anything else:** (1) check Workers error logs for CPU-limit errors on auth endpoints, right now, today — this could be actively broken in production. (2) Decide, with that answer in hand, whether to upgrade to Workers Paid ($5/mo) — this is very likely the correct call regardless, since it resolves both walls at once.

---

## 1. Current architecture snapshot

Gumpa's backend is a single Cloudflare Worker (`server/src/index.ts`, ~50 routes) fronting D1 (`sidequest-db`), R2 (`sidequest-photos`), and KV (`RATE_LIMIT`) — see `server/wrangler.toml`, which declares no custom domain or route (no `[[routes]]` block), matching the `workers.dev`-shaped placeholder URLs in `.env.example` and `dashboard/.env.example`. Auth is stateless JWT verified via `requireAuth`; a single hardcoded `env.DEV_USER_ID` gates all 13 `/admin/*` routes via `requireDeveloper`. Photo verification calls Claude Haiku 4.5 directly from the Worker per submission (uncached, one call per photo). Local-challenge copy generation was redesigned 2026-08-12: a Haiku call now runs once per newly-discovered real venue (cached forever in D1's `venue_pool` table, never regenerated on a schedule), not on a weekly per-region cycle — a separate `place_fetch_log` table throttles how often OpenStreetMap gets re-scanned per area (roughly every 14 days per ~20km radius) independently of that. There is no queue, no Durable Object, and — because there's no custom domain declared in the repo — no confirmed edge-cache layer in front of the Worker's own responses.

## 2. Confirmed: Cloudflare Workers Free plan

Per the user, 2026-08-07. Current Free-plan limits (verified live against Cloudflare's pricing page this run, not from memory):

| Resource | Free-plan limit |
|---|---|
| Workers requests | 100,000/day |
| Workers CPU time | 10ms per invocation |
| D1 storage | 5GB |
| D1 rows read | 5,000,000/day |
| D1 rows written | 100,000/day |
| KV reads | 100,000/day |
| KV writes/deletes | **1,000/day** |
| KV storage | 1GB |
| R2 storage | 10GB |
| R2 Class A ops (writes/lists) | 1,000,000/month |
| R2 Class B ops (reads) | 10,000,000/month |
| R2 egress | free on every plan |

(Workers Paid, $5/mo, for reference: no daily request cap — 10M/month included then $0.30/million; CPU time up to 30s/invocation default, configurable to 5min; D1 25B rows read + 50M rows written/month included, then metered; KV 10M reads + 1M writes/month included, then $0.50/$5.00 per million; R2 pricing unchanged, same free egress.)

## 3. Volume capacity estimate — where's the first wall?

**The first wall is CPU time, and it may already be hit today, at any traffic level** — see §6. Setting that aside as a separate (non-DAU-scaled) risk, here is where each Free-plan resource is exhausted as daily active users grow, using per-user/day action-count assumptions stated below (re-derive with real numbers once you have any — these are order-of-magnitude estimates from the route inventory, not measured production traffic):

**Assumed actions/user/day:** 1 login, 2 photo-verify submissions, 2 quest completions, 3 comments, 3 local-challenge fetches (roughly one per app session), 0.5 rewards-interest checks, ~10 general feed/list reads, ~40 photo views (feed scrolling), ~8 kudos taps, 2 photo/R2 writes (from completions).

| Resource | Free-plan cap | Consumption at 100 DAU | at 500 DAU | at 2,000 DAU | Rough DAU before it's hit |
|---|---|---|---|---|---|
| **KV writes** (`checkRateLimit`, §4) | 1,000/day | **~1,150/day — already over** | ~5,750/day | ~23,000/day | **~87** |
| Workers requests (~35/user/day) | 100,000/day | ~3,500/day | ~17,500/day | ~70,000/day | ~2,850 |
| D1 writes (~16.5/user/day) | 100,000/day | ~1,650/day | ~8,250/day | ~33,000/day | ~6,000 |
| D1 reads (~100/user/day, feed pagination + friend-status subqueries) | 5,000,000/day | ~10,000/day | ~50,000/day | ~200,000/day | far beyond realistic scale |
| R2 Class B ops (~45/user/day, photo views) | 10,000,000/month | ~135,000/mo | ~675,000/mo | ~2.7M/mo | ~7,400 |
| R2 Class A ops (~2.1/user/day, uploads) | 1,000,000/month | ~6,300/mo | ~31,500/mo | ~126,000/mo | far beyond realistic scale |
| Anthropic Haiku spend | no hard cap, metered | ~$13/mo | ~$66/mo | ~$264/mo | never "hit," just grows |

**Conclusion, stated plainly:** on Workers Free, KV writes are exhausted around **87 DAU** — well inside "a few hundred people trying it out," and *already exceeded* at the 100-DAU scenario modeled above. Every other resource has an order of magnitude or more headroom beyond that. When KV writes are exhausted, `checkRateLimit`'s `env.RATE_LIMIT.put()` call (`ratelimit.ts:17`) starts failing — the failure mode isn't graceful degradation, it's either the rate limiter silently stops enforcing (if the KV write fails silently) or every rate-limited endpoint (login, verify, complete, comment, local-challenges, rewards-interest, recommend) starts erroring outright. Upgrading to Workers Paid moves this wall out to roughly **~4,700+ DAU** on the same math (33,000 KV writes/day included at the $5/mo tier, scaled the same way), which is comfortably beyond any near-term scenario worth planning for right now.

## 4. Cost model

### Anthropic (Claude Haiku 4.5)

Pricing pulled live via the `claude-api` skill this run: **$1.00/MTok input, $5.00/MTok output** (unchanged from the prior report). Model confirmed at `server/src/verify.ts:20` and `server/src/local-challenges.ts:18`: `claude-haiku-4-5-20251001`.

**Per photo-verify call** (`handleVerify`, `verify.ts:23-74`, rate-limited to 20/user/hour):
- Client capture (`src/lib/photo.ts:74,95`) sets JPEG `quality: 0.5` but applies **no resolution cap** on the full proof photo (only the separate 9×8 hash-thumbnail is resized, `photo.ts:49`). Confirmed unchanged this run.
- Haiku 4.5 doesn't have the high-resolution vision path (Opus 4.7+/Sonnet 5 only) — Anthropic auto-downscales to roughly a 1568px long edge before tokenizing, capping image cost regardless of the original phone-camera resolution: **~1,600 image tokens**.
- Prompt text (`buildPrompt`, `verify.ts:121-135`): ~200 tokens. Output (`max_tokens: 200`): ~50-80 actual tokens.
- **Cost per call: ≈ (1,800 tok × $1.00/MTok) + (70 tok × $5.00/MTok) ≈ $0.0022.**

**Per local-challenges Claude call** (`local-challenges.ts`'s `generateCopy`, one call per pool-population pass, covering however many newly-discovered venues that pass found): ~750 input + up to 800 output ≈ **$0.0033/call** — same per-call order of magnitude as before, but this now fires even less often. The 2026-08-12 redesign replaced the old per-~1km-region weekly regeneration (which re-billed Claude for the *same* venues every week, every region) with a long-lived `venue_pool`: a venue's copy is generated once, ever, then reused indefinitely across every future period and every user whose radius reaches it. A `place_fetch_log` table throttles the underlying OpenStreetMap re-scan (not the Claude call itself) to roughly once per ~20km area per 14 days — 1 hour if that scan found nothing — superseding the old `EMPTY_NEGATIVE_CACHE_SECONDS`/per-region negative cache. Net effect: this line item is even more negligible in aggregate than the previous estimate below suggests. `city-image.ts`'s own permanent-negative-cache bug (the NYC incident referenced in AGENTS.md) is confirmed still fixed — negative geocode/image lookups now expire after 30 days while positive results cache forever.

| Scenario | Verify calls/day (2/user) | Daily Haiku cost | Monthly Haiku cost |
|---|---|---|---|
| 100 DAU | 200 | ~$0.44 | ~$13 |
| 500 DAU | 1,000 | ~$2.20 | ~$66 |
| 2,000 DAU | 4,000 | ~$8.80 | ~$264 |

Still true from the last report: **Haiku cost is not the risk.** It scales linearly with no surprise cliff. The one real Anthropic-side risk remains burst *rate limits* (RPM/TPM), not aggregate spend — a low-usage API account's per-minute ceiling could throttle a synchronized spike (e.g. many users completing a "daily" streak around a midnight reset). Worth checking the account's current tier in the Anthropic console before a launch push — not re-verified this run, carried over from the last audit as still open (LV-6).

### Cloudflare

Both plan scenarios (Free confirmed as current; Paid modeled for comparison):

| | Workers Free (confirmed current) | Workers Paid ($5/mo) |
|---|---|---|
| Nearest wall | KV writes, ~87 DAU (already exceeded in the 100-DAU scenario) | KV writes, ~4,700+ DAU |
| CPU time per request | 10ms — **PBKDF2 100k iterations may already exceed this; unverified, check today** | up to 30s default, configurable to 5min — PBKDF2 is a non-issue |
| Monthly base cost | $0 | $5 + metered overage past included amounts (not reached at any DAU modeled here) |

## 5. Security / abuse gaps at public scale

Ranked by real-world impact, cross-checked against AGENTS.md's existing "Product scope" callout. The route inventory this run surfaced a substantially larger unrated-limited surface than the last audit had documented — not just the feed/photos/search endpoints flagged before, but nearly every "cheap write" in the app.

1. **`handleGetPhoto` still has zero auth or privacy check** (`server/src/feed.ts:158-169`) — confirmed unchanged. It doesn't even accept a `Request` object, so it structurally cannot check who's asking; any R2 key that exists is served to anyone, with a `cache-control: public, max-age=31536000, immutable` header, regardless of the owning post's friends-only/public status. This remains the single highest-impact privacy gap: a leaked photo URL (screenshot, shared link, logged referrer) makes a private account's proof photo permanently fetchable by anyone, no account required. AGENTS.md's "quest photos are real people's real-time proof content — treat them as sensitive by default" applies directly.
2. **No moderation/report/block mechanism anywhere in the server** — confirmed unchanged; a repo-wide grep for report/block/moderation/flag logic and D1 migrations turns up nothing user-facing. `comments.ts`'s own file-header comment states this directly: a comment is "exactly as exposed to abuse as a kudos tap is today." A post written by `handleComplete` reaches the public feed the instant the account has `is_public = 1` — no review step exists between submission and public visibility.
3. **The unrated-limited surface is broader than previously documented.** Confirmed still unlimited: `/feed/public`, `/photos/*` (also unauthenticated), `/users/search`, kudos toggle. **Newly surfaced this run:** `/posts/mine`, `/posts/:id/comments` (read), `/friends`, `/friends/request`, `/friends/respond`, `/groups`, `/groups/:id`, `/groups/join`, `/groups/:id/pots` (create — debits tokens), `/pots/:id/join` (stakes tokens), `/pots/:id` (read), `/duels`, `/duels/:id/accept|decline|cancel`, `/tokens/me`, `/challenges/custom`, `/boosts/active`, `/timed-challenges`, `/account/avatar` (R2 write), `/account/privacy`, `/auth/me` — none of these call `checkRateLimit`. Most concerning among the new list: **pot creation and pot joining touch the token economy with zero throttling** — worth a follow-up check (out of scope this run) on whether the token-debit logic itself has any server-side abuse guard, since the rate-limit gap means a script can hit these as fast as the network allows.
4. **`/auth/reset-password` (the actual password-set step, not the request step) has no rate limit** — `handleResetPassword` (`auth.ts:290-329`) is reachable with only a 48-hex-char token and 30-minute expiry gating it; `handleRequestPasswordReset` (the email-sending step) is limited, but the completion endpoint isn't. Token entropy (192 bits) makes brute-force infeasible regardless, so this is low severity, but it's an inconsistency worth closing for completeness.
5. **Photo upload has no size validation anywhere** — confirmed unchanged. Neither `verify.ts` nor `complete.ts` checks `photoBase64` length before `atob()`-decoding it (`http.ts:29-34`, no size guard) or forwarding it to Anthropic. An oversized upload today fails late (post-decode, post-CPU-spend) as a generic error rather than a clean rejection.

## 6. Known bottlenecks (code-level)

- **PBKDF2 100,000 iterations per login/signup/password-reset — now a confirmed-urgent open question, not a reassuring signal.** `server/src/crypto.ts:16-21` (`derive`, via `hashPassword`/`verifyPassword`) runs PBKDF2-SHA256 at 100k iterations. Call sites: `auth.ts:76` (signup), `:109` (login), `:319` and `:322` (password-reset completion — this endpoint runs the derive **twice** in one request). The previous report used this as evidence the account was "probably already on Paid," since Free's ~10ms CPU ceiling "would struggle to fit" it. **That assumption is now falsified** — the account is confirmed Free. Whether native `crypto.subtle.deriveBits` (not JS-level looping) fits inside 10ms of billed CPU time on Workers is a real open question this audit cannot resolve from the repo alone. **Check the Cloudflare dashboard's Workers Logs / Errors for `/auth/login` and `/auth/signup` today** — if requests are hitting "Exceeded CPU Limit," every login and signup attempt is currently failing in production, independent of how many users there are.
- **`checkRateLimit` KV write on every allowed rate-limited call** (`server/src/ratelimit.ts:12-19`) — confirmed, and confirmed to cover more actions than previously modeled: `login`, `signup`, `resend-verify`, `reset-request`, `verify`, `complete`, `comment`, `local-challenges` (both the 120/hr overall limiter and a 5/day limiter gating Overpass/Claude spend — renamed `local-challenges-fetch` as of the 2026-08-12 redesign, previously `local-challenges-gen`; same threshold, same shape, checked less often per user in practice now that pool coverage lasts up to 14 days instead of regenerating weekly), `rewards-interest`, `recommend` — 11 call sites total. This is why §3's KV-write wall (~87 DAU) is the nearer of the two real scaling walls. The store itself is documented as non-atomic (`ratelimit.ts:1-4`): concurrent requests can race past the limit check before either write lands — "a deterrent against casual brute-forcing, not a hard guarantee."
- **`findDuplicateHash` full-table scan** (`server/src/photo-hash.ts:82-88`) — confirmed unchanged. Every photo submission pulls the most recent 5,000 `photo_hashes` rows (`RECENT_HASHES_LIMIT`) and computes an in-JS Hamming distance against each one until an early match or exhaustion. The file's own comment (`photo-hash.ts:9-12`) already documents this as a scaling compromise and separately flags the *general* Workers-CPU-limit risk in file-header prose — but does not itself name a concrete row-count threshold to revisit at (that's tracked as LV-5 below, still open). This is a slow-burn cost tied to total historical submissions, not concurrent traffic — not urgent, but worth a trigger.
- **The JPEG thumbnail decode (`@jsquash/jpeg`) stays cheap** — confirmed this run: the only call site (`photo-hash.ts:44`, via `computeDHash`) is fed exclusively by the client-generated 9×8 `hashThumbnailBase64` (`src/lib/photo.ts:49`), a separate field from the full-size `photoBase64` used for the Anthropic call and R2 storage. No code path has grown to feed it a full-size image.
- **Photo serving likely bypasses edge caching entirely.** New finding this run: `server/wrangler.toml` declares no custom domain or route, and both `.env.example` files use `workers.dev`-shaped placeholder URLs. Cloudflare's edge cache is not guaranteed for a bare `workers.dev` Workers response even with a `cache-control: public, max-age=31536000, immutable` header — that guarantee typically requires a custom domain with cache rules, which isn't configured in this repo (dashboard-only config, can't be fully confirmed from the repo alone — flagging as an open question same as the plan-tier question was last time). If true, **every photo view re-hits the Worker + R2**, not just the first one — meaning the R2 Class B and Workers-request estimates in §3 are a lower bound, not a cushion, for feed-heavy usage.
- **Shared free-API dependencies** (`city-image.ts`, `places.ts`) — Nominatim, Wikipedia, Wikimedia Commons, Overpass — all confirmed to send a proper identifying User-Agent (`Gumpa/1.0 (personal project; contact: chriskarateew@gmail.com)`) this run, and all are structurally low-volume. As of the 2026-08-12 redesign this is even lower-volume than when this was first written: Overpass is only called from `local-challenges.ts` on a `place_fetch_log` coverage miss, roughly once per ~20km area per 14 days, not weekly per ~1km region — and a real-world venue's Overpass/Claude cost is paid at most once ever, not re-paid on every regeneration. Also worth noting operationally: Overpass's shared public instance proved genuinely unreliable under this project's own testing volume in August 2026 (frequent 429s/504s/timeouts) — the code already retries once and degrades gracefully (see `runQuery` in `places.ts`), but this is a real-world reliability risk worth remembering, separate from the request-volume question this bullet is about. No explicit client-side throttling exists in `city-image.ts`/`places.ts` themselves, but volume is controlled one layer up by the fetch-coverage TTL and per-user fetch limit. Low near-term risk.
- **No max-size check on `photoBase64`** (`verify.ts`, `complete.ts`) — confirmed unchanged; see §5.5.

## 7. Recommendations, ranked by (fix effort) vs (how soon the wall hits)

1. **Check the Cloudflare dashboard's Workers error logs for CPU-limit errors on `/auth/login` and `/auth/signup`, today.** Five minutes, zero code changes, and it answers whether auth is silently broken in production right now — the single most urgent unknown in this entire report.
2. **Upgrade to Workers Paid ($5/mo).** This is very likely correct regardless of what #1 finds: it removes the ~87-DAU KV-write wall (§3) *and* removes any CPU-time risk from PBKDF2 (§6) in one move, for the cost of a coffee a month, on a project already committed to "move fast" per AGENTS.md's Working style. This is a billing decision — flag it to the user rather than acting on it directly, consistent with the harness's own gate on production-affecting actions.
3. **Add an auth+visibility check to `handleGetPhoto`** — highest-impact code fix in §5, and cheap relative to effort: it needs the same `posts`/`friendships`/`users.is_public` lookup the feed query (`handleListFeed`) already performs. Unlike #1/#2, this doesn't wait on the plan decision.
4. **Rate-limit the unauthenticated/cheap endpoints named in §5.3**, starting with `/feed/public` and `/photos/:key` (zero-account reachable) and then the token-economy-touching ones (`/groups/:id/pots` create, `/pots/:id/join`) given they're new-this-run findings with a plausible abuse angle beyond "wasted CPU."
5. **Add a size cap on `photoBase64`** before decode/forward, per §5.5 — same as last report, still open.
6. **Give `findDuplicateHash` a concrete row-count revisit trigger** (e.g. 20k-50k rows) — the file has general scaling-aware comments already, but no specific number to act on. Low effort, not urgent.
7. **Check the Anthropic console's current rate-limit tier** before a launch push — not re-verified this run (LV-6, still open), relevant to burst concurrency, not cost.
8. **Don't spend effort optimizing Haiku cost** — still the cheapest, most linear part of the stack (§4).
9. **Moderation/report/block tooling remains a deferred, separate project** — not a quick fix, flagged again per AGENTS.md's existing "Product scope" gap, to prioritize once the public feed is actually seeing stranger traffic.
