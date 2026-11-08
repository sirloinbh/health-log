-- Number goals and the dates they hold from (#45). A change adds a row instead of overwriting, so
-- each past day is still judged by the goal it had. A NULL target turns the goal off from that date.
CREATE TABLE IF NOT EXISTS goals (
  -- calories: at most, kcal a day. protein: at least, g a day. sleep: at least, minutes a night.
  -- sober_days: at least, days without a drink in a Monday-to-Sunday week.
  item text NOT NULL CHECK (item IN ('calories', 'protein', 'sleep', 'sober_days')),
  effective_from date NOT NULL,
  target integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item, effective_from),
  CONSTRAINT goals_target_range CHECK (
    target IS NULL
    OR (item = 'calories' AND target BETWEEN 100 AND 10000)
    OR (item = 'protein' AND target BETWEEN 1 AND 1000)
    OR (item = 'sleep' AND target BETWEEN 60 AND 1440)
    OR (item = 'sober_days' AND target BETWEEN 1 AND 7)
  )
);
