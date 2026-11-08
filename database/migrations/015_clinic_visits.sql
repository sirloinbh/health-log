-- Clinic visits and the procedures done at each (#39). Medical details are sensitive: the API never
-- puts their content in a log line, and tests and docs use made-up values only.
CREATE TABLE IF NOT EXISTS clinic_visits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visit_date date NOT NULL,
  clinic text NOT NULL CHECK (char_length(clinic) BETWEEN 1 AND 100),
  department text CHECK (char_length(department) BETWEEN 1 AND 50),
  -- Symptoms and diagnosis, as the person wants to remember them.
  note text CHECK (char_length(note) BETWEEN 1 AND 1000),
  -- Whole won.
  cost integer CHECK (cost BETWEEN 0 AND 100000000),
  next_visit_on date CHECK (next_visit_on >= visit_date),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinic_visits_visit_date_idx ON clinic_visits (visit_date);

CREATE TABLE IF NOT EXISTS clinic_procedures (
  visit_id bigint NOT NULL REFERENCES clinic_visits (id) ON DELETE CASCADE,
  -- Keeps the order they were entered in.
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 10),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  area text CHECK (char_length(area) BETWEEN 1 AND 50),
  -- Dose or count as written, such as "100유닛" or "3회차": the units vary too much for a number.
  amount text CHECK (char_length(amount) BETWEEN 1 AND 50),
  cost integer CHECK (cost BETWEEN 0 AND 100000000),
  note text CHECK (char_length(note) BETWEEN 1 AND 500),
  PRIMARY KEY (visit_id, position)
);
