-- One sleep per day, filed under the date of waking (#26, #27).
-- Stages and score come from an import (#28); NULL means "not known", never zero.
CREATE TABLE IF NOT EXISTS sleep_records (
  sleep_date date PRIMARY KEY,
  bed_at timestamptz NOT NULL,
  wake_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  deep_minutes integer CHECK (deep_minutes >= 0),
  light_minutes integer CHECK (light_minutes >= 0),
  rem_minutes integer CHECK (rem_minutes >= 0),
  awake_minutes integer CHECK (awake_minutes >= 0),
  sleep_score smallint CHECK (sleep_score BETWEEN 0 AND 100),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'garmin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sleep_records_wake_after_bed CHECK (wake_at > bed_at),
  -- Imports write here too, so the database holds the length limit as well.
  CONSTRAINT sleep_records_at_most_a_day CHECK (wake_at - bed_at <= interval '24 hours')
);
