-- Junk food (#38). The user marks each food; franchise fast food is imported already marked
-- (docs/food-data.md). A meal entry copies the mark when it is recorded, like its nutrients, so
-- changing a food's mark later never changes past days. Typed-in entries carry their own mark.
-- No stored food was franchise fast food when this was added, so no existing row is marked here.
ALTER TABLE foods ADD COLUMN IF NOT EXISTS is_junk boolean NOT NULL DEFAULT false;
ALTER TABLE meal_entries ADD COLUMN IF NOT EXISTS is_junk boolean NOT NULL DEFAULT false;

-- The weekly and monthly counts read only the marked entries of a date range.
CREATE INDEX IF NOT EXISTS meal_entries_junk_date_idx ON meal_entries (entry_date) WHERE is_junk;
