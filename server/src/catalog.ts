// Gumpa — shared, server-trusted challenge lookup. Static catalog first
// (cheap, in-memory, the common case), then a D1 lookup for a
// server-generated local challenge, then a D1 lookup for a developer-authored
// recurring Task (see dev-challenges.ts), then a D1 lookup for a
// developer-authored time-boxed Challenge (see timed-challenges.ts). Either
// way the result is fully server-validated: a client request body can never
// manufacture a catalog entry, only reference one that already exists in one
// of these trusted sources. Used by both /verify (to get the real
// title/desc for the AI check, never the client's) and /complete (to get the
// real tokens/cadence/verify method for crediting and post text).
//
// On top of whichever base entry resolves, an active developer "boost" (see
// boosts.ts) can override just the tokens amount for a time window — applied
// here, once, so every consumer (verify's AI check is unaffected since it
// only reads title/desc, but /complete's crediting and the denormalized
// posts.tokens_earned both pick up the boosted amount automatically).

import { getActiveBoost } from './boosts';
import type { Env } from './env';
import { getDevChallengeById } from './dev-challenges';
import { getLocalChallengeById } from './local-challenges';
import { getTimedChallengeById, TIMED_CHALLENGE_CADENCE_PLACEHOLDER } from './timed-challenges';
import { CHALLENGE_CATALOG, type CatalogEntry, type Cadence, type VerifyType } from './tokens';

export async function resolveBaseCatalogEntry(env: Env, challengeId: string): Promise<CatalogEntry | null> {
  const staticEntry = CHALLENGE_CATALOG[challengeId];
  if (staticEntry) return staticEntry;

  const localRow = await getLocalChallengeById(env, challengeId);
  if (localRow) {
    return {
      cadence: localRow.cadence as Cadence,
      tokens: localRow.tokens,
      verify: localRow.verify_type as VerifyType,
      // Always 'camera' — a local challenge is a real-venue visit by
      // construction, never a screenshot task.
      proofType: 'camera',
      title: localRow.title,
      desc: localRow.description,
      placeLat: localRow.place_lat,
      placeLng: localRow.place_lng,
      placeName: localRow.place_name,
    };
  }

  const devRow = await getDevChallengeById(env, challengeId);
  if (devRow) {
    return {
      cadence: devRow.cadence as Cadence,
      tokens: devRow.tokens,
      verify: devRow.verify_type as VerifyType,
      proofType: devRow.proof_type as CatalogEntry['proofType'],
      target: devRow.streak_target ?? undefined,
      title: devRow.title,
      desc: devRow.desc,
      ...(devRow.place_lat != null && devRow.place_lng != null
        ? { placeLat: devRow.place_lat, placeLng: devRow.place_lng, radiusMeters: devRow.radius_meters ?? undefined }
        : {}),
    };
  }

  const timedRow = await getTimedChallengeById(env, challengeId);
  if (timedRow) {
    return {
      // Never actually read — complete.ts branches on `kind` before ever
      // computing a cadence-based period key for a timed challenge.
      cadence: TIMED_CHALLENGE_CADENCE_PLACEHOLDER,
      tokens: timedRow.tokens,
      verify: 'photo',
      proofType: timedRow.proof_type as CatalogEntry['proofType'],
      title: timedRow.title,
      desc: timedRow.desc,
      kind: 'timed',
      deadlineAt: timedRow.created_at + timedRow.duration_minutes * 60 * 1000,
      ...(timedRow.place_lat != null && timedRow.place_lng != null
        ? { placeLat: timedRow.place_lat, placeLng: timedRow.place_lng, radiusMeters: timedRow.radius_meters ?? undefined }
        : {}),
    };
  }

  return null;
}

export async function resolveCatalogEntry(env: Env, challengeId: string): Promise<CatalogEntry | null> {
  const base = await resolveBaseCatalogEntry(env, challengeId);
  if (!base) return null;

  const boost = await getActiveBoost(env, challengeId);
  if (!boost) return base;

  return { ...base, tokens: boost.boosted_tokens };
}
