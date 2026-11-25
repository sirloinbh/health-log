-- A goal to eat nothing after a set time of day (#328). Item last_meal: the target is the last
-- allowed minute of the day, counted from midnight (21:00 is 1260), Asia/Seoul.
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_item_check;
ALTER TABLE goals ADD CONSTRAINT goals_item_check
  CHECK (item IN ('calories', 'protein', 'sleep', 'sober_days', 'last_meal'));
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_target_range;
ALTER TABLE goals ADD CONSTRAINT goals_target_range CHECK (
  target IS NULL
  OR (item = 'calories' AND target BETWEEN 100 AND 10000)
  OR (item = 'protein' AND target BETWEEN 1 AND 1000)
  OR (item = 'sleep' AND target BETWEEN 60 AND 1440)
  OR (item = 'sober_days' AND target BETWEEN 1 AND 7)
  OR (item = 'last_meal' AND target BETWEEN 1 AND 1439)
);
