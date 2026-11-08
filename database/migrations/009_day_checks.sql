-- The day's own yes/no checks (#37): did the diet hold, was the sleep good.
-- NULL means "not checked" and is never counted as a no. A day with nothing in it is no row at all.
CREATE TABLE IF NOT EXISTS day_checks (
  record_date date PRIMARY KEY,
  diet_kept boolean,
  sleep_good boolean,
  memo text CHECK (char_length(memo) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT day_checks_not_empty CHECK (
    diet_kept IS NOT NULL OR sleep_good IS NOT NULL OR memo IS NOT NULL
  )
);
