-- The time of day a meal slot was eaten, once per slot per day (#327). Wall-clock time in
-- Asia/Seoul. No row means "not recorded": days before this table have none, and the API never
-- guesses a time. Setting a slot's time to null deletes its row.
CREATE TABLE IF NOT EXISTS meal_times (
  entry_date date NOT NULL,
  meal text NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  eaten_time time(0) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_date, meal)
);
