# Rewards economy plan

Why the money-facing parts of the app are built the way they are, and
what's locked in versus still open. Companion to
`docs/gumpa-plus-billing-roadmap.md` (the business/legal setup) and
`docs/gumpa-plus-perks-roadmap.md` (the checklist for building the
Gumpa+ perks this doc describes). This doc covers the economics.

## The mistake this doc originally made, and the fix

The first version of this plan sized a redemption cap ($5/billing cycle)
against a subscription price ($9.99/month) and called it done, because the
combination stays profitable for the business even in the worst case. It
does. But it never asked the other question: **why would a rational person
pay $9.99 for a maximum of $5 back?** Run that arithmetic and the answer is
"they wouldn't" — a subscription whose entire pitch is "unlock spending
your own points for less than you paid" is a bad deal by construction, and
users notice.

The fix isn't a different cap or a different price. It's that **gift-card
redemption can only be one perk in a bundle, never the pitch itself.**
Gumpa+ has to sell faster progress and real features; the capped real-money
redemption is a bonus on top, not the reason to subscribe.

## What Gumpa+ actually bundles

| Perk | Cost to the business | Status |
|---|---|---|
| Token earn multiplier on completions (1.5x while subscribed) | ~free (only costs money at redemption, not at earning) | **Built** — perks roadmap Phase 5 |
| Streak protection (grace day without losing your streak) | ~free | **Built** — perks roadmap Phase 6 |
| Exclusive / early-access challenges | ~free (content-gating, not cash) | **Built** — perks roadmap Phase 4 |
| Cosmetic flare (badge, profile flourish) | ~free | **Built** — perks roadmap Phase 2 |
| Gift-card redemption, capped per billing cycle | real dollars, capped | **Built** — see below |

Everything above the redemption row is cheap or free to provide (it's
either pure content-gating or a multiplier on a currency that only becomes
a real liability at the capped redemption step). Redemption is the one row
with real, capped dollar cost — sized so the bundle stays profitable even
if every subscriber maxes it out every month, per the math below. The
perks themselves are what makes $9.99/month a reasonable ask independent of
whether someone ever redeems a gift card at all.

## Locked in (2026-08-12)

Don't re-litigate these without a real reason — build to them:

1. **Redemption is capped in dollars per billing cycle, independent of
   token balance.** A user still needs enough tokens to cover a redemption
   (tokens are debited via `token_ledger`/`debitTokens`, `'reward_redeem'`
   reason), but even with unlimited tokens banked, they cannot exceed the
   cap for the current cycle. This is still necessary even inside a bundle:
   checked against the real challenge catalog, a user completing every
   suggested task earns **~$17.40/month** in token value on the provisional
   100-coins-per-dollar rate — well past any plausible subscription price
   on its own.
2. **The cap is anchored to the subscriber's actual billing cycle**
   (`users.gumpa_plus_period_start`/`gumpa_plus_period_end`, set from
   RevenueCat webhook events), not a calendar month.
3. **Redemption cap: $5 per billing cycle** (`REDEMPTION_CAP_USD_PER_CYCLE`,
   `server/src/rewards.ts`). Stays profitable even in the worst case (100%
   of subscribers redeeming the full cap every month) at every subscription
   price considered. Raising this later is easy; lowering it on subscribers
   already used to a higher number is not.
4. **Target subscription price: $9.99/month**, net ~$8.49/subscriber/month
   after Apple/Google's 15% cut, giving **$3.49/subscriber/month margin on
   the redemption line alone**, before counting the (near-zero-cost) other
   perks. Nothing in app code hardcodes this — it lives entirely in App
   Store Connect / Play Console once Phase 5 of the billing roadmap is
   reached.
5. **A subscriber must hold Gumpa+ for at least 48 hours before their first
   redemption in a period** (`MIN_SUBSCRIPTION_AGE_MS`,
   `server/src/rewards.ts`) — a cheap deterrent against subscribing for one
   cycle purely to drain a token balance built up for free, then
   cancelling.
6. **`has_gumpa_plus` is written only by the RevenueCat webhook handler**
   (`server/src/subscriptions.ts`), read fresh from the DB on every
   redemption attempt — never a cached client flag.
7. **The Store (one-time consumable purchases) is a separate revenue
   stream from Gumpa+, not folded into it.** Anyone can buy a Store item
   regardless of subscription status — see below.
8. **Brand-sponsored quests are a real future revenue stream, not built
   yet.** A brand (Starbucks/Chipotle/CAVA or others) pays for a featured
   "try this, post about it" quest — real foot traffic plus user-generated
   content, and it flips the funding direction so the brand subsidizes the
   reward instead of the business buying every gift card at face value.
   Deliberately deferred until the app has a real user base and enough
   credibility to pitch a brand — pursuing this too early with no audience
   wastes the one pitch a small brand contact is likely to give. Revisit
   once there's real DAU to point to.

### Margin table behind decisions 3/4

Net revenue assumes the 15% Apple Small Business Program / Google standard
rate from `docs/gumpa-plus-billing-roadmap.md` Phase 4. "Worst case" is
100% of subscribers redeeming the full cap every cycle — the number that
actually determines safety, since redemption behavior isn't something the
app controls. "Realistic case" assumes roughly half of subscribers redeem
the full cap in a given month (a breakage assumption similar to gym
memberships or cashback apps) — treated as upside, not the plan. This table
only covers the redemption line item; the other bundle perks cost close to
nothing on top of it.

| Subscription price | Net after platform cut | Cap | Worst case | Realistic case (~50%) |
|---|---|---|---|---|
| $6.99/mo | $5.94 | $5 | +$0.94 | +$3.44 |
| $7.99/mo | $6.79 | $5 | +$1.79 | +$4.29 |
| $7.99/mo | $6.79 | $7 | -$0.21 | +$3.26 |
| **$9.99/mo** | **$8.49** | **$5** | **+$3.49** | **+$5.99** |
| $9.99/mo | $8.49 | $7 | +$1.49 | +$4.99 |
| $9.99/mo | $8.49 | $10 | -$1.51 | +$3.49 |

## The Store: a separate revenue stream

Not a Gumpa+ perk — a parallel, a la carte way to spend real money on
one-time consumables, open to every user regardless of subscription status.
Modeled on standard freemium-game monetization (Duolingo's streak freezes,
gem purchases, etc.): small, optional, immediate-value purchases that don't
depend on anyone reasoning about a monthly cap.

**Built (2026-08-12):**

- `server/migrations/0028_store.sql`: `user_boosts` (a personal,
  time-boxed token-earning multiplier — distinct from `token_boosts`,
  which is developer-granted and applies to *everyone* attempting a
  specific challenge, not to one user's own completions) and
  `store_purchases` (full audit trail, mirrors `subscription_events`'
  append-only pattern).
- `server/src/store.ts`: the catalog (currently one item — see below),
  `GET /store/catalog`, and `applyStorePurchase`/
  `getActivePersonalBoostMultiplier`, called from the same
  `POST /webhooks/revenuecat` handler as Gumpa+ subscription events
  (RevenueCat's `NON_RENEWING_PURCHASE` event type, routed before the
  subscription-entitlement logic, with its own idempotency table).
- `server/src/complete.ts`: the active personal multiplier is now applied
  once, right after the catalog entry resolves, and reused consistently
  for both the credited token amount and the `posts.tokens_earned` shown
  in the feed — no path where those two numbers could disagree.
- `src/app/store.tsx` + a Profile entry point: real catalog fetch, "coming
  soon" purchase flow (same posture as Gumpa+ — the backend is real, only
  `react-native-purchases` is missing).
- **Verified end-to-end against local D1**: wrong webhook secret rejected,
  a valid `NON_RENEWING_PURCHASE` grants a 2x/24h boost, duplicate event ID
  is a no-op (confirmed by row count), an unknown `product_id` still
  records the purchase with no boost granted (so revenue is never silently
  dropped even for a since-retired item), an expired boost is excluded
  from the active-multiplier lookup, and a user with no purchases correctly
  resolves to a 1x multiplier. Test data and the temporary webhook secret
  were cleaned up afterward.

**Ships with exactly one item on purpose**: `boost_2x_24h` ("24-Hour Double
Tokens"). A streak-freeze consumable was considered and deferred, not
forgotten — spending one requires the client-side streak logic to know how
to consume it, which doesn't exist until Phase 6 (streak protection) of
`docs/gumpa-plus-perks-roadmap.md` ships. Selling an item with no way to
use it yet would be a half-built feature.

## What's still stubbed, on purpose

- **`HAS_GUMPA_PLUS` in `src/app/rewards.tsx` is still hardcoded `false`,
  and Store purchases are still a "coming soon" tap.** Both need
  `react-native-purchases` (RevenueCat's SDK), which needs a real
  RevenueCat account (billing roadmap Phase 5) and App Store Connect / Play
  Console products for both Gumpa+ and each Store item.
- **Gift-card fulfillment isn't wired up.** `handleRedeemReward` records a
  redemption as `'pending'` but makes no external API call — needs a
  funded Tremendous or Tango Card account, which needs the business bank
  account (billing roadmap Phase 2) first.
- **The full Gumpa+ bundle is now built** (redemption, earn multiplier,
  exclusive/early-access challenges, cosmetic flare, and streak
  protection — see the table above). Everything left in this section is
  specifically blocked on the business/billing side, not app code.

## Open questions

- **Tremendous vs. Tango Card**, and their actual fee structure — needs a
  real account to check. Confirm CAVA specifically is in whichever
  catalog is chosen; it's a smaller chain than Starbucks/Chipotle.
- **Only 1 real `/rewards/interest` tap recorded so far** (Starbucks, $25
  tier) as of 2026-08-12 — recheck before finalizing which brands/tiers
  launch with.
- **Token expiry** — `users.tokens` currently accumulates forever with no
  decay. The dollar cap already neutralizes the "grind for free, subscribe
  one month, drain everything" exploit, so expiry isn't required for
  safety, but a long expiry (e.g. 12 months unused) is worth considering
  later to bound long-tail liability. Some US states regulate gift-
  certificate expiration — worth a CPA/lawyer sanity check before adding
  any expiry logic (billing roadmap Phase 9).
