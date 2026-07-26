export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  RATE_LIMIT: KVNamespace;
  ANTHROPIC_API_KEY: string;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
}
