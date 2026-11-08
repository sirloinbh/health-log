-- Reminders marked done (#48). A reminder is the next visit day of a clinic visit or the last day of
-- a medicine; it is kept with that day, so moving the day to another one reminds again. Deleting
-- the visit or the medicine takes its marks with it.
CREATE TABLE IF NOT EXISTS reminders_done (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visit_id bigint REFERENCES clinic_visits (id) ON DELETE CASCADE,
  medication_id bigint REFERENCES medications (id) ON DELETE CASCADE,
  due_on date NOT NULL,
  done_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((visit_id IS NULL) <> (medication_id IS NULL)),
  -- Null never equals null, so each pair only ever meets marks of its own kind. Each also serves
  -- as the index for its id, which the deletes of a visit or a medicine look up.
  UNIQUE (visit_id, due_on),
  UNIQUE (medication_id, due_on)
);
