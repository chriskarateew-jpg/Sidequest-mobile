-- Optional user-written caption on a completed-quest post, separate from the
-- catalog's objective quest_title/quest_desc.
ALTER TABLE posts ADD COLUMN caption TEXT;
