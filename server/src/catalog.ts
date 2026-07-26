// Sidequest — shared, server-trusted challenge lookup. Static catalog first
// (cheap, in-memory, the common case) — only the rarer unrecognized id falls
// through to a D1 lookup for a server-generated local challenge. Either way
// the result is fully server-validated: a client request body can never
// manufacture a catalog entry, only reference one that already exists in one
// of these two trusted sources. Used by both /verify (to get the real
// title/desc for the AI check, never the client's) and /complete (to get the
// real tokens/cadence/verify method for crediting and post text).

import type { Env } from './env';
import { getLocalChallengeById } from './local-challenges';
import { CHALLENGE_CATALOG, type CatalogEntry, type Cadence, type VerifyType } from './tokens';

export async function resolveCatalogEntry(env: Env, challengeId: string): Promise<CatalogEntry | null> {
  const staticEntry = CHALLENGE_CATALOG[challengeId];
  if (staticEntry) return staticEntry;

  const row = await getLocalChallengeById(env, challengeId);
  if (!row) return null;
  return { cadence: row.cadence as Cadence, tokens: row.tokens, verify: row.verify_type as VerifyType, title: row.title, desc: row.description };
}
