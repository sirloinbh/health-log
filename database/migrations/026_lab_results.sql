-- Checkup and blood test results (#330). One row per measured value: the test is free text with its own
-- unit and optional reference range, so any checkup fits, and a result can link to a visit (user decisions on #330). Medical values are
-- sensitive: tests and docs use made-up values only.
CREATE TABLE IF NOT EXISTS lab_results (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  test_date date NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  value numeric(14, 4) NOT NULL CHECK (value >= 0),
  unit text CHECK (char_length(unit) BETWEEN 1 AND 20),
  ref_low numeric(14, 4) CHECK (ref_low >= 0),
  ref_high numeric(14, 4) CHECK (ref_high >= 0),
  note text CHECK (char_length(note) BETWEEN 1 AND 500),
  -- The visit the test was taken at, if any. Deleting the visit keeps the result, unlinked.
  visit_id bigint REFERENCES clinic_visits (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ref_low IS NULL OR ref_high IS NULL OR ref_low <= ref_high)
);

CREATE INDEX IF NOT EXISTS lab_results_test_date_idx ON lab_results (test_date);
CREATE INDEX IF NOT EXISTS lab_results_visit_id_idx ON lab_results (visit_id);
CREATE INDEX IF NOT EXISTS lab_results_name_idx ON lab_results (lower(name), test_date);
