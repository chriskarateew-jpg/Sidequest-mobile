-- Category (fitness/finance/social/courage/explore/mind) was never shown
-- to end users and never read by any verify/complete logic (CatalogEntry
-- in server/src/tokens.ts has no cat field) — it only existed as a
-- required field in developer/admin authoring forms. Removed at the
-- user's request as dead weight, not deprecated: dropping the column
-- outright rather than leaving it nullable-and-unused.
ALTER TABLE dev_challenges DROP COLUMN cat;
ALTER TABLE timed_challenges DROP COLUMN cat;
ALTER TABLE local_challenges DROP COLUMN cat;
