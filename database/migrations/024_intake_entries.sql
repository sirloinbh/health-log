-- Water and caffeine drinks, one row per drink (#325).
-- amount is what that drink counted for when it was added: ml for water, mg of caffeine for the others.
-- It is stored per row so changing the defaults later does not rewrite past days.
-- consumed_at is the moment the drink was counted, kept only when it is counted on the day it was drunk
-- (a drink added to a past day has no real time), so a later report can compare caffeine with sleep.
-- The newest row of a kind is the one the minus button removes.
CREATE TABLE IF NOT EXISTS intake_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('water', 'coffee', 'tea', 'energy', 'other_caffeine')),
  amount integer NOT NULL CHECK (amount > 0 AND amount <= 2000),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intake_entries_day_idx ON intake_entries (record_date, kind, id);
