-- Medicines taken over a period (#40). Medical details are sensitive: the API never puts their
-- content in a log line, and tests and docs use made-up values only.
CREATE TABLE IF NOT EXISTS medications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  -- As written on the label, such as "500mg" or "1정".
  dose text CHECK (char_length(dose) BETWEEN 1 AND 50),
  -- How to take it, such as "하루 2번 식후".
  directions text CHECK (char_length(directions) BETWEEN 1 AND 100),
  start_on date NOT NULL,
  -- No end yet means still being taken.
  end_on date CHECK (end_on >= start_on),
  note text CHECK (char_length(note) BETWEEN 1 AND 500),
  -- The visit it was prescribed at, if any. Deleting the visit keeps the medicine, unlinked.
  visit_id bigint REFERENCES clinic_visits (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medications_start_on_idx ON medications (start_on);
CREATE INDEX IF NOT EXISTS medications_visit_id_idx ON medications (visit_id);
