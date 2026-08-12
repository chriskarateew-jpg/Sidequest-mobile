export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  RATE_LIMIT: KVNamespace;
  ANTHROPIC_API_KEY: string;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  // The one account allowed to use the /admin/* developer-only endpoints
  // (see requireDeveloper in auth.ts). Set via `wrangler secret put
  // DEV_USER_ID` — never committed, never present in the client bundle.
  DEV_USER_ID: string;
  // Shared secret RevenueCat sends back verbatim as the Authorization header
  // on every webhook call (configured in RevenueCat's dashboard, not derived
  // from anything) — see server/src/subscriptions.ts. Set via `wrangler
  // secret put REVENUECAT_WEBHOOK_SECRET` once a RevenueCat account exists
  // (docs/gumpa-plus-billing-roadmap.md Phase 5). Unset in the meantime, in
  // which case the webhook handler refuses every request.
  REVENUECAT_WEBHOOK_SECRET?: string;
}
