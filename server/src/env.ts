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
}
