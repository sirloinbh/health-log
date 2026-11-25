-- The day's condition scores (#323): mood, energy and stress from 1 to 5.
-- NULL means "not rated". A row may now hold only scores, so the not-empty rule counts them too.
ALTER TABLE day_checks
  ADD COLUMN IF NOT EXISTS mood smallint CHECK (mood BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS energy smallint CHECK (energy BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS stress smallint CHECK (stress BETWEEN 1 AND 5);

ALTER TABLE day_checks DROP CONSTRAINT IF EXISTS day_checks_not_empty;
ALTER TABLE day_checks ADD CONSTRAINT day_checks_not_empty CHECK (
  diet_kept IS NOT NULL OR sleep_good IS NOT NULL OR memo IS NOT NULL
  OR mood IS NOT NULL OR energy IS NOT NULL OR stress IS NOT NULL
);
