# Live-Volume Report

**Generated:** 2026-08-05
**Source:** first run of `docs/live-volume-audit-prompt.md` against the codebase as of this date.
**Re-run the audit prompt** whenever traffic changes materially or before a real public launch push — this is a snapshot, not a standing guarantee, and several conclusions below hinge on one fact (the Cloudflare Workers plan) that isn't visible from the repo.

## tl;dr

Claude Haiku (the photo-verification model) is **not** the risk. It's the cheapest, most predictable part of the whole stack — a few dollars a month at hundreds of users, scaling linearly with no surprise cliffs. The real ceiling is **Cloudflare's Workers KV write quota**, and if the account is still on the Workers **Free** plan, that wall sits at roughly **140 daily active users** — well inside "a few hundred people trying it out." If the account is already on Workers **Paid** ($5/mo), that same wall moves out to roughly 4,500+ DAU and the nearer risks become a couple of missing auth/rate-limit checks rather than a hard quota.

**Action item #1, before anything else:** confirm in the Cloudflare dashboard (Workers & Pages → Plans) whether this account is on Free or Paid. Almost everything below is stated as "if Free / if Paid" because that single toggle changes every other number by 10-30x.

---

## 1. Current architecture snapshot

Gumpa's backend is a single Cloudflare Worker (`server/src/index.ts`) fronting D1 (`sidequest-db`, relational data), R2 (`sidequest-photos`, photo bytes), and KV (`RATE_LIMIT`, a counter store) — see `server/wrangler.toml`. Auth is stateless JWT (no DB hit to verify a session token, only to look up email-verification/reset tokens). Photo verification calls Claude Haiku 4.5 directly from the Worker per submission; a separate, cached Haiku call writes local-challenge copy once per region per week. There is no queue, no Durable Object, and no CDN layer of its own beyond whatever Cloudflare's edge does automatically for a Workers response.

## 2. Volume capacity estimate — where's the first wall?

| Resource | Free-plan cap | Rough DAU before it's hit* | Paid-plan ($5/mo) cap | Rough DAU before it's hit* |
|---|---|---|---|---|
| **KV writes** (`checkRateLimit`, see §4) | 1,000/day | **~140** | ~33,000/day included, then $5/million | **~4,700** |
| Workers requests | 100,000/day | ~3,300 (at ~30 req/user/day) | no daily cap, $0.30/million after 10M/mo | tens of thousands+ |
| R2 Class B ops (photo GETs) | 10,000,000/month | ~1,500-2,000 (feed-heavy usage) | same free allotment, then $0.36/million | much higher, cheap overage |
| D1 reads/writes | 5M reads/day, 100k writes/day | tens of thousands | 25B reads/mo, 50M writes/mo included | far beyond realistic scale here |
| Anthropic Haiku spend | no hard cap, pure metered cost | never "hit," just grows (see §3) | same | same |

\* These are order-of-magnitude estimates from typical per-user action counts (assume 1 login + 3 photo-verify + 3 complete calls/day/user, ~30 total API calls/day/user, ~40 feed photos viewed per feed load), not measured production traffic. Rerun with real numbers once you have any.

**Conclusion:** if this account is still on the Workers Free plan, **KV writes are the wall, and it's a low one.** `checkRateLimit` (`server/src/ratelimit.ts`) does a KV read *and* a KV write on every allowed call to any rate-limited endpoint — login, signup, verify, complete, comment, recommend, rewards-interest, local-challenges. A user doing nothing more than logging in and completing three quests a day already burns ~7 KV writes; the free tier's 1,000/day cap divides out to roughly 140 such users before writes start silently failing (KV `put` failures wouldn't throw loudly — they'd just mean the rate limiter stops enforcing, or worse, `checkRateLimit` throws and rate-limited endpoints start 500ing). Either failure mode is bad, and it happens well before "a few hundred users," let alone real public scale.

If the account is already on Workers Paid, this wall moves to ~4,700 DAU and the practical bottleneck shifts to something softer: Workers request volume, R2 read volume from feed scrolling, or the slow-burn CPU cost described in §5.

## 3. Cost model — Anthropic Haiku

Pulled live via the `claude-api` skill (Haiku 4.5: **$1.00/MTok input, $5.00/MTok output** — see `server/src/verify.ts:20`, model `claude-haiku-4-5-20251001`).

**Per photo-verify call** (`handleVerify` in `verify.ts`):
- Image: the camera capture (`src/lib/photo.ts`) has no client-side resolution cap — it's captured at native camera resolution with JPEG quality 0.5 (compression only, not downscaling). Haiku 4.5 doesn't have the newer high-resolution vision path (that's Opus 4.7+/Sonnet 5 only), so the Anthropic API auto-downscales any image above roughly a 1568px long edge before tokenizing — meaning essentially every phone photo submitted here lands at the same capped cost regardless of how big the original was: **~1,600 image tokens**.
- Prompt text (challenge title/desc + instructions in `buildPrompt`): ~200 tokens.
- Output (`max_tokens: 200`, actual JSON response is short): ~50-80 tokens.
- **Cost per call: input (1,800 tok × $1.00/MTok) + output (70 tok × $5.00/MTok) ≈ $0.0022** — about a fifth of a cent.

**Per local-challenges copy-gen batch** (`local-challenges.ts`, cached per region per week, not per user): input ~750 tokens, output up to 800 — roughly **$0.0033/batch**, and it only runs on a cache miss, so aggregate cost is negligible.

| Scenario | Verify calls/day (3/user) | Daily Haiku cost | Monthly Haiku cost |
|---|---|---|---|
| 100 DAU | 300 | ~$0.66 | ~$20 |
| 500 DAU | 1,500 | ~$3.30 | ~$100 |
| 2,000 DAU | 6,000 | ~$13.20 | ~$400 |

This scales linearly and stays small at any realistic near-term scale — **Haiku cost was the thing you asked about, and it's the one part of this stack that isn't actually a concern.** The one real Anthropic-side risk isn't aggregate spend, it's **burst rate limits**: a new/low-spend API account starts at a lower usage tier (lower requests-per-minute/tokens-per-minute), and those limits scale up automatically with account spend history over time. A synchronized spike — e.g. a lot of users completing their "daily" challenge right around a midnight reset — could hit a per-minute cap before the account's tier has caught up, producing a burst of 429s from Anthropic that have nothing to do with total monthly cost. Worth checking the account's current tier/limits in the Anthropic console before a launch push, not because of cost but because of concurrency.

## 4. Known bottlenecks (code-level)

- **`checkRateLimit` KV write on every rate-limited call** (`server/src/ratelimit.ts:12-19`) — see §2. The fix isn't code, it's plan tier, but worth knowing this is *why* KV is the tight constraint rather than D1 or R2.
- **`findDuplicateHash` full-table scan** (`server/src/photo-hash.ts:82-88`) — every photo submission pulls the most recent 5,000 `photo_hashes` rows and computes an in-JS Hamming distance against each one. The file's own comment already flags this as a "cheap at current scale, revisit if this table grows large" tradeoff. This isn't a volume-of-concurrent-users problem, it's a slow-burn problem: cost per submission grows with total historical submissions, not with today's traffic. Worth picking a row-count threshold (e.g. 20k-50k rows) to come back and add an index or shard the hash space.
- **PBKDF2 100,000 iterations per login/signup** (`server/src/crypto.ts:20`) — correct security choice, but real CPU cost per request. That this is already in production alongside a WASM JPEG decode (`photo-hash.ts`) is itself decent evidence this account is *already* on Workers Paid, since the free tier's ~10ms CPU-time-per-request ceiling (per the comment at `photo-hash.ts:9-11`) would struggle to fit PBKDF2 at that iteration count. Worth confirming rather than assuming.
- **Shared free-API dependencies** (`server/src/city-image.ts`, `server/src/places.ts`) — Nominatim, Wikipedia, Wikimedia Commons, and Overpass are all free/no-key, which also means they're rate-limited by usage policy and shared across every Cloudflare Worker hitting them, not just this app's traffic. Low near-term risk (results are cached per region essentially forever, per the file's own negative-cache-TTL design — see AGENTS.md's "Caching & failure handling" section), but worth knowing this isn't infinite headroom if local-challenge generation volume grows a lot.
- **No client- or server-side max size check on `photoBase64`** (`verify.ts`, `complete.ts`) — a Workers request-body limit and Anthropic's own per-image size cap will eventually reject an oversized upload, but there's no graceful handling today (a huge upload fails as a generic 502 from the Anthropic call, per `verify.ts:76,81`), and CPU/bandwidth are already spent by the time that happens.

## 5. Security / abuse gaps at public scale

Ranked by real-world impact, cross-checked against AGENTS.md's existing "Product scope" callout (moderation/reporting/blocking already named as a gap there):

1. **`handleGetPhoto` has no auth or privacy check** (`server/src/feed.ts:126-137`). It serves any photo key to any request, unconditionally. The friends-only/public-feed visibility rule is enforced in `handleListFeed`, but the actual photo bytes at `/photos/:key` aren't gated by that same rule — if a photo URL ever leaks (screenshot, shared link, logged URL), a private account's proof photo is fetchable by anyone, with no account and no rate limit. This is a real instance of the AGENTS.md concern that "quest photos are real people's real-time proof content — treat them as sensitive by default."
2. **No moderation/report/block mechanism on the public feed** — already named as a gap in AGENTS.md; confirmed still true. Once accounts start opting into the public feed, there's currently no way for a user to report a photo/comment, block another account, or for you to remove abusive content short of a manual D1 edit.
3. **No rate limit on unauthenticated reads**: `/feed/public` and `/photos/:key` are both reachable with zero account and zero cost to an attacker (no `checkRateLimit` call in either path). `/users/search`, `/friends`, group/pot/duel reads, and the kudos toggle are similarly unguarded. None of these are expensive individually, but at "a few hundred strangers," an unthrottled public/unauthenticated endpoint is the cheapest thing for someone to script against.
4. **Photo upload has no size validation** — see §4. Not exploitable for much beyond wasted CPU/bandwidth today, but worth closing before it's a public target.

## 6. Recommendations, ranked by (fix effort) vs (how soon the wall hits)

1. **Confirm the Workers plan in the Cloudflare dashboard.** Five minutes, and it's the single fact everything else in this report depends on.
2. **If still on Workers Free, upgrade to Paid ($5/mo) before any real launch.** This alone removes the ~140-DAU KV-write wall (the nearest one by far) and likely also resolves any CPU-time headroom question around PBKDF2/WASM decode.
3. **Add an auth+visibility check to `handleGetPhoto`** so a photo's fetchability matches the same friends/public rule the feed already enforces. This is the highest-impact fix in §5 relative to effort — it's a lookup against the existing `posts`/`friendships`/`users.is_public` data the feed query already joins.
4. **Add per-IP rate limiting to `/feed/public` and `/photos/:key`**, the two endpoints reachable with no account at all.
5. **Add a size cap on `photoBase64` before it's decoded or forwarded to Anthropic**, with a clear client-facing error instead of a generic 502.
6. **Note the `photo_hashes` full-scan for later, not now** — pick a row-count trigger (e.g. 20k-50k rows) to revisit with an index or a sharded hash lookup, per the file's own comment.
7. **Don't spend effort optimizing Haiku cost** — it's the cheapest, most linear part of the stack at any volume discussed here. Do check the Anthropic console's current rate-limit tier before a launch push, since burst concurrency (not aggregate spend) is the one real risk on that side.
8. Moderation/report/block tooling is a bigger, separate project (not a quick fix) — flagging it here as a known gap to prioritize once the public feed opt-in is actually being used by strangers, per AGENTS.md.
