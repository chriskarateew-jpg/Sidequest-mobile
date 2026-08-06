// Gumpa — shared optional-location parsing for developer-authored content
// (dev-challenges.ts's Tasks, timed-challenges.ts's Challenges). Generalizes
// the GPS pin + radius local_challenges already gets automatically (see
// complete.ts's checkPhotoFraud) so the developer can opt any authored
// entry into the same proximity check, with its own radius instead of the
// one fixed constant local_challenges uses.

import { error } from './http';

// Below 20m risks false-rejects against real GPS accuracy (~10-50m,
// worse indoors — see complete.ts's existing note on this). Above 5km
// stops being a meaningful "specific spot" check.
const MIN_RADIUS_METERS = 20;
const MAX_RADIUS_METERS = 5000;

export interface LocationFields {
  placeLat: number;
  placeLng: number;
  radiusMeters: number;
}

// Returns null when no location fields were sent at all (the common case —
// location is optional), a Response when something was sent but is
// malformed, or the validated fields otherwise. All three fields are
// required together — a pin with no radius (or vice versa) isn't valid.
export function parseOptionalLocation(body: Record<string, unknown>): LocationFields | null | Response {
  const hasAny = body.placeLat != null || body.placeLng != null || body.radiusMeters != null;
  if (!hasAny) return null;

  const placeLat = Number(body.placeLat);
  const placeLng = Number(body.placeLng);
  const radiusMeters = Number(body.radiusMeters);

  if (!Number.isFinite(placeLat) || !Number.isFinite(placeLng) || !Number.isFinite(radiusMeters)) {
    return error('placeLat, placeLng, and radiusMeters must all be provided together');
  }
  if (Math.abs(placeLat) > 90 || Math.abs(placeLng) > 180) return error('Invalid placeLat/placeLng');
  if (!Number.isInteger(radiusMeters) || radiusMeters < MIN_RADIUS_METERS || radiusMeters > MAX_RADIUS_METERS) {
    return error(`radiusMeters must be a whole number between ${MIN_RADIUS_METERS} and ${MAX_RADIUS_METERS}`);
  }

  return { placeLat, placeLng, radiusMeters };
}
