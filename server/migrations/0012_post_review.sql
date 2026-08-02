-- Star rating (1-5, nullable) from the new post-submission review screen,
-- and tokens_earned denormalized at completion time — re-deriving it later
-- from the catalog would break for expired local challenges or if a static
-- challenge's reward changes after the fact.
ALTER TABLE posts ADD COLUMN rating INTEGER;
ALTER TABLE posts ADD COLUMN tokens_earned INTEGER;
