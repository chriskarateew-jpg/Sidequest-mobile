# Gumpa expense tracker

A running log of every fixed, variable, and subscription cost that goes into building and running Gumpa, alongside a break-even model so it's clear how many paying subscribers it takes to cover them. Companion to [`gumpa-plus-billing-roadmap.md`](./gumpa-plus-billing-roadmap.md) (that doc is the setup checklist; this one is the money).

## The actual spreadsheet

**[expense-tracker.xlsx](./expense-tracker.xlsx)** — open it in Excel (or Numbers, or import into Google Sheets) and edit it directly. It has two tabs:

- **Expenses** — every line item below, plus a summary block at the bottom (`Total annual cost`, split by Fixed / Variable / Subscription). Add a row any time you incur a new cost; the summary formulas pick it up automatically.
- **Break-Even Analysis** — the yellow cells are assumptions you edit (Gumpa+ price, app store commission, per-subscriber redemption cost); everything else recalculates live, ending in "subscribers needed to break even."

## What's real right now vs. what's a placeholder

Only a few numbers in the sheet are confirmed real charges. Everything else is a `$0.00` / `TBD` placeholder with a note on what it'll cost once it's actually incurred — I didn't guess at current SaaS pricing, since a wrong guess would quietly poison the break-even math worse than an honest blank. Update the `Amount` and `Confirmed?` columns as each one becomes real.

**Confirmed:**
- **Domain registration (Cloudflare Registrar) — $10.46/year.** This is the one that prompted the tracker: it auto-renews annually by default even though you didn't opt into yearly renewal. Worth checking the renewal toggle in the Cloudflare dashboard if that's not what you want.
- **Apple Developer Program — $99/year** and **Google Play Console — $25 one-time**: standard published fees, not yet paid but locked in whenever you enroll.
- **Cloudflare Workers/D1/R2/KV, Resend** are all currently on their free tiers ($0), which is why the app costs nothing to run today — but each has a usage cap, noted in the sheet, worth watching as real traffic shows up.

**Placeholders (TBD), highlighted yellow in the Expenses tab:**
- Anthropic API spend (Claude Haiku — powers local-challenge copy and photo verification, both pay-as-you-go; check console.anthropic.com for actual monthly spend)
- LLC filing fee, registered agent
- RevenueCat, a ToS/Privacy Policy generator, bookkeeping software, CPA fees

## How the break-even math works

Gumpa+'s price isn't locked in yet (see the roadmap doc, Phase 5), so the Break-Even Analysis tab is deliberately built around assumptions you can swap out instantly:

1. **Total annual operating cost** pulls straight from the Expenses tab's summary total.
2. **Net revenue per subscriber/month** = price × (1 − app store commission). Commission defaults to 15% (Apple's Small Business Program / Google's standard first-$1M tier); switch it to 30% if you're not enrolled in the reduced rate.
3. **Contribution margin per subscriber** = net revenue − average reward-redemption cost per subscriber (this ties directly to the token exchange rate math from the roadmap doc, not finalized yet either — leave it at $0 until it is).
4. **Subscribers needed to break even** = total annual cost ÷ annual contribution margin per subscriber.

As real numbers replace the placeholders (actual Anthropic spend, actual LLC fees, an actual locked-in Gumpa+ price), that last number gets more accurate. Right now, with only the confirmed costs in the sheet, it's an honest "close to zero" — the real target only becomes meaningful once the TBD rows are filled in.
