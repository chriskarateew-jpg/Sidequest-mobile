# Gumpa+ billing and business banking roadmap

A checklist for standing up the business entity, bank account, and in-app billing so Gumpa+ subscriptions can go live alongside the app store launch. Check items off as you complete them. Steps are ordered by dependency (each generally needs the one before it), not by priority, so work top to bottom.

## The constraint this whole plan is built around

Gumpa+ unlocks a feature inside the app (reward redemption), so Apple and Google require it to be sold through their own in-app purchase systems (StoreKit / Google Play Billing), not Stripe or any other processor. Apple rejects apps that try to route around this (App Store Review Guideline 3.1.1).

Money flow is therefore:

**Revenue in:** User subscribes in-app, Apple/Google hold their commission (15% or 30%, see step 7), and pay out the remainder to the business bank account on their own monthly schedule.

**Expenses out:** Operating account funds a dedicated Rewards Reserve sub-account on a set schedule, which pays for actual gift cards at fulfillment time. Operating account separately covers SaaS bills.

Stripe's role here is for money going out (buying gift cards, a future web checkout), not subscription revenue coming in on mobile.

**RevenueCat** is the layer that unifies StoreKit and Google Play Billing subscription status and pushes a webhook to the backend, which is what ultimately flips the `HAS_GUMPA_PLUS` flag already stubbed in `src/app/rewards.tsx`.

## Phase 1: Legal entity and tax ID

- [ ] Form a single-member LLC in your state of residence (filing fee typically $50 to $500, approval same-day to a couple of weeks depending on state)
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
- [ ] Lock in the actual subscription price and per-cycle redemption cap (ties directly to the token exchange rate and breakeven math from the rewards economics conversation, don't set this arbitrarily)

## Phase 6: Backend integration (app code, not business setup)

- [ ] Add a `subscription_events` table (mirrors the existing `token_ledger` audit-trail pattern)
- [ ] Add a `has_gumpa_plus` column to `users`
- [ ] Add a `POST /webhooks/revenuecat` handler that updates subscription status on new subscription, renewal, and cancellation events
- [ ] Add `react-native-purchases` (RevenueCat SDK) to the Expo app
- [ ] Replace the hardcoded `HAS_GUMPA_PLUS = false` in `src/app/rewards.tsx` with a real entitlement check
- [ ] Gate the server-side redemption endpoint (Phase 4 of the Rewards feature roadmap) on the same `has_gumpa_plus` flag, not just the client UI

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
