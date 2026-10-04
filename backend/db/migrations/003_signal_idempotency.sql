-- Make signal upserts idempotent under network retries: a re-sent event (same seq) must not
-- count as a new observation; only a later re-analysis (higher seq) increments times_seen.
ALTER TABLE crew.signals ADD COLUMN IF NOT EXISTS last_seq integer;
UPDATE crew.signals SET last_seq = seq WHERE last_seq IS NULL;
ALTER TABLE crew.signals ALTER COLUMN last_seq SET NOT NULL;
