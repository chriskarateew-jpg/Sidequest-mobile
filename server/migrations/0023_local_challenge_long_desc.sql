-- Adds a longer, detail-view description alongside the existing short card
-- "description" — the short one stays a one-sentence card blurb, this one
-- is 2-3 sentences of extra context/history for a tap-to-expand detail view
-- (see src/components/location-detail-modal.tsx). Existing rows backfill to
-- '' (client falls back to the short description when this is empty) rather
-- than NULL, so older cached batches don't need a special-case null check.
ALTER TABLE local_challenges ADD COLUMN long_description TEXT NOT NULL DEFAULT '';
