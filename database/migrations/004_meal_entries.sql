-- What was eaten on a day (#30). Name, serving and nutrients are copied per serving when recorded,
-- so editing a food later never changes past days. A NULL nutrient means "not known", never zero.
CREATE TABLE IF NOT EXISTS meal_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_date date NOT NULL,
  meal text NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  -- NULL for food typed in directly, or if the food is ever removed.
  food_id bigint REFERENCES foods (id) ON DELETE SET NULL,
  name text NOT NULL,
  brand text,
  servings numeric(6, 2) NOT NULL CHECK (servings > 0),
  serving_size numeric(8, 2) CHECK (serving_size > 0),
  serving_unit text,
  calories numeric(8, 2) CHECK (calories >= 0),
  carbs numeric(8, 2) CHECK (carbs >= 0),
  protein numeric(8, 2) CHECK (protein >= 0),
  fat numeric(8, 2) CHECK (fat >= 0),
  sugars numeric(8, 2) CHECK (sugars >= 0),
  sodium numeric(8, 2) CHECK (sodium >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meal_entries_entry_date_idx ON meal_entries (entry_date);
