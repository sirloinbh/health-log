-- The database holds the rules the API checks for sleep and body records (#197). Imports may write to these
-- tables directly (003_sleep_records.sql), so the API alone cannot keep the data consistent.
-- Each constraint is dropped first so the file is safe to run again. A row that breaks a rule stops the
-- migration with the constraint's name; nothing is changed silently.

-- The stored length is the bed-to-wake span in rounded minutes, the rule of sleepMinutes in backend/src/sleep.ts.
ALTER TABLE sleep_records DROP CONSTRAINT IF EXISTS sleep_records_duration_matches_times;
ALTER TABLE sleep_records ADD CONSTRAINT sleep_records_duration_matches_times
  CHECK (duration_minutes = round(extract(epoch FROM wake_at - bed_at) / 60));

-- The memo limit of the API (bodyInput in backend/src/body.ts): 1 to 500 characters, and not only spaces.
ALTER TABLE body_records DROP CONSTRAINT IF EXISTS body_records_memo_length;
ALTER TABLE body_records ADD CONSTRAINT body_records_memo_length
  CHECK (char_length(memo) BETWEEN 1 AND 500 AND memo ~ '[^[:space:]]');

-- A record holds at least one value; the API refuses an empty save the same way. A memo alone counts, as in the
-- API. Diastolic pressure needs no term of its own: body_records_pressure_pair ties it to systolic.
ALTER TABLE body_records DROP CONSTRAINT IF EXISTS body_records_not_empty;
ALTER TABLE body_records ADD CONSTRAINT body_records_not_empty CHECK (
  weight_kg IS NOT NULL OR body_fat_percent IS NOT NULL OR waist_cm IS NOT NULL OR systolic_mmhg IS NOT NULL
  OR memo IS NOT NULL
);
