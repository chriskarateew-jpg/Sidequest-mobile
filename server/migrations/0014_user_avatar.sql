-- Optional profile picture. Nullable — most users never set one.
ALTER TABLE users ADD COLUMN avatar_key TEXT;
