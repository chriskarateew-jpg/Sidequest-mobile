# Gumpa+ billing and business banking roadmap

A checklist for standing up the business entity, bank account, and in-app billing so Gumpa+ subscriptions can go live alongside the app store launch. Check items off as you complete them. Steps are ordered by dependency (each generally needs the one before it), not by priority, so work top to bottom.

## The constraint this whole plan is built around

Gumpa+ unlocks features inside the app — as of 2026-08-12 this is a bundle (token earn multiplier, streak protection, exclusive/early-access challenges, cosmetic flare, and capped gift-card redemption; see `docs/rewards-economy-plan.md` for why redemption alone isn't a sellable pitch on its own), not just reward redemption — so Apple and Google require it to be sold through their own in-app purchase systems (StoreKit / Google Play Billing), not Stripe or any other processor. Apple rejects apps that try to route around this (App Store Review Guideline 3.1.1). The same rule applies to the separate Store feature (one-time consumable purchases like token boosts, `server/src/store.ts`) — it's a different revenue stream from Gumpa+, but still in-app-purchase-gated for the same reason, and needs its own products created in App Store Connect / Play Console alongside the subscription.

Money flow is therefore:

**Revenue in:** User subscribes in-app, Apple/Google hold their commission (15% or 30%, see step 7), and pay out the remainder to the business bank account on their own monthly schedule.

**Expenses out:** Operating account funds a dedicated Rewards Reserve sub-account on a set schedule, which pays for actual gift cards at fulfillment time. Operating account separately covers SaaS bills.

Stripe's role here is for money going out (buying gift cards, a future web checkout), not subscription revenue coming in on mobile.

**RevenueCat** is the layer that unifies StoreKit and Google Play Billing subscription status and pushes a webhook to the backend, which is what ultimately flips the `HAS_GUMPA_PLUS` flag already stubbed in `src/app/rewards.tsx`.

## Phase 1: Legal entity and tax ID

- [x] Form a single-member LLC in your state of residence (filing fee typically $50 to $500, approval same-day to a couple of weeks depending on state)
- [ ] Set up a registered agent if your state requires one and you don't want to act as your own
- [ ] Apply for an EIN at irs.gov once the LLC is approved (free, instant online)

## Phase 2: Business bank account

- [ ] Open a business checking account with Mercury or Relay (recommended over a traditional bank: no monthly fees, fast online setup with LLC docs + EIN, free sub-accounts)
- [ ] Create an Operating sub-account (default account for revenue in, SaaS bills out)
- [ ] Create a Rewards Reserve sub-account (funded from Operating on a set schedule, pays for actual gift cards at fulfillment)

## Phase 3: App store organization accounts

- [ ] Apply for a D-U-N-S number if you don't already have one (free, can take 1 to 2 weeks to verify, start this early and in parallel with Phase 1)
- [ ] Enroll in the Apple Developer Program as an organization (not your personal Apple ID)
- [ ] Enroll in Google Play Console as an organization

## Phase 4: Link banking to the app stores

- [ ] In App Store Connect, under Agreements, Tax, and Banking: sign the Paid Applications Agreement, submit a W-9, add the LLC bank account and routing numbers
- [ ] In Play Console's Payments profile, add the equivalent banking and tax info
- [ ] Enroll in Apple's Small Business Program (drops commission from 30% to 15% for developers under $1M annual proceeds; does not auto-apply, must be requested)
- [ ] Confirm Google's standard 15% first-$1M subscription tier applies (no separate enrollment needed)

## Phase 5: Subscription infrastructure

- [ ] Create a RevenueCat account
- [ ] Connect RevenueCat to App Store Connect via API credentials
- [ ] Connect RevenueCat to Play Console via API credentials
- [ ] Define a single entitlement (e.g. `gumpa_plus`) that both platforms' products map to
- [ ] Create the subscription product in App Store Connect (subscription group, price tier, localized description)
- [ ] Create the equivalent base plan in Play Console
- [ ] Create the Store's non-renewing-purchase products in App Store Connect / Play Console (starts with one: `gumpa_store_boost_2x_24h`, "24-Hour Double Tokens" — see `server/src/store.ts`'s `STORE_CATALOG` for the product id this must match exactly)
- [x] Lock in the actual subscription price and per-cycle redemption cap: **$9.99/month, $5/cycle redemption cap** (2026-08-12) — see `docs/rewards-economy-plan.md` for the margin math. This is the target number for creating the actual products below; it isn't set anywhere in app code (the price lives entirely in App Store Connect / Play Console), but the $5 cap **is** already enforced server-side (`REDEMPTION_CAP_USD_PER_CYCLE`, `server/src/rewards.ts`)

## Phase 6: Backend integration (app code, not business setup)

- [x] Add a `subscription_events` table (mirrors the existing `token_ledger` audit-trail pattern) — `server/migrations/0027_gumpa_plus_subscriptions.sql` (2026-08-12)
- [x] Add a `has_gumpa_plus` column to `users` — same migration, plus `gumpa_plus_period_start`/`gumpa_plus_period_end` for cycle-anchored cap tracking
- [x] Add a `POST /webhooks/revenuecat` handler that updates subscription status on new subscription, renewal, and cancellation events — `server/src/subscriptions.ts`, verified end-to-end against local D1 with real webhook payloads (auth rejection, entitlement grant, idempotency, expiration revoke) — see `docs/rewards-economy-plan.md`
- [x] Extend the same webhook handler for the Store's one-time purchases — `NON_RENEWING_PURCHASE` events route to `server/src/store.ts`'s `applyStorePurchase` before the subscription logic runs, with their own idempotency table (`store_purchases`); verified end-to-end against local D1 (2026-08-12)
- [ ] Add `react-native-purchases` (RevenueCat SDK) to the Expo app — blocked on Phase 5's RevenueCat account existing; don't install/wire this before there's a real account to connect it to. Covers both Gumpa+ and Store purchases, one SDK integration for both.
- [ ] Replace the hardcoded `HAS_GUMPA_PLUS = false` in `src/app/rewards.tsx` with a real entitlement check, and the Store's "coming soon" purchase tap (`src/app/store.tsx`) with a real StoreKit/Play Billing purchase flow — both call paths behind them are already real (see next item), this is specifically the SDK-backed triggers, blocked on the same RevenueCat account as above
- [x] Gate the server-side redemption endpoint on the same `has_gumpa_plus` flag, not just the client UI — `POST /rewards/redeem` (`server/src/rewards.ts`) reads `has_gumpa_plus` fresh from the DB on every call, plus enforces the $5/cycle cap and a 48-hour minimum subscription age; verified end-to-end locally

## Phase 7: Legal requirements before submission

- [ ] Draft Terms of Service (generated template via Termly or Iubenda, then reviewed by a lawyer), explicitly stating what Gumpa+ entitles a subscriber to (a capped redemption amount per billing cycle, not unlimited), the cancellation/refund policy, and a fulfillment SLA for gift cards
- [ ] Draft Privacy Policy (required by Apple regardless of subscriptions)
- [ ] Confirm both are hosted at a stable URL and linked from the subscription purchase screen before submitting for App Store review (Guideline 3.1.2)

## Phase 8: Bookkeeping

- [ ] Set up Wave (free) or QuickBooks Simple Start
- [ ] Set a recurring process to reconcile Apple's and Google's monthly payout reports (gross, commission, net) against actual bank deposits
- [ ] Tag Rewards Reserve transfers and gift card purchases as distinct expense categories, separate from SaaS/operating costs, so real margin is visible rather than guessed

## Phase 9: Professional advice (don't skip this)

- [ ] Consult a CPA before launch on digital subscription sales tax treatment in your state
- [ ] Ask the same CPA whether to keep the LLC's default pass-through tax treatment or elect S-corp status once revenue is real

## After all of the above

Apple and Google can legally collect subscription payments and pay them into the LLC's account with zero custom code once Phases 1 through 5 are done. Phase 6 is what makes the app itself respect that a user has paid. None of this depends on the `rewards_interest` demand-signal data from the earlier phase of the Rewards feature work, since this is infrastructure, not validation, but the Rewards Reserve account in Phase 2 doubles as an ongoing, real-money version of that same signal once subscribers exist.
