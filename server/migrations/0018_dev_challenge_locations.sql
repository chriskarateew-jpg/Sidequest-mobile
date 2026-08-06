-- Optional GPS pin + radius for developer-authored Tasks (dev_challenges)
-- and time-boxed Challenges (timed_challenges) — generalizes the GPS-
-- proximity check that local_challenges already gets automatically (see
-- server/src/complete.ts's checkPhotoFraud) to any developer-authored
-- content, with a per-challenge radius instead of one fixed constant.
-- All nullable: a Task/Challenge with no pin behaves exactly as before.

ALTER TABLE dev_challenges ADD COLUMN place_lat REAL;
ALTER TABLE dev_challenges ADD COLUMN place_lng REAL;
ALTER TABLE dev_challenges ADD COLUMN radius_meters INTEGER;

ALTER TABLE timed_challenges ADD COLUMN place_lat REAL;
ALTER TABLE timed_challenges ADD COLUMN place_lng REAL;
ALTER TABLE timed_challenges ADD COLUMN radius_meters INTEGER;
