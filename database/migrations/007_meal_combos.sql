-- Foods often eaten together, recorded as a meal in one go (#46). Items point at foods; recording
-- copies each food's values at that moment into meal_entries, so editing a combo or a food later
-- never changes days already recorded.
CREATE TABLE IF NOT EXISTS meal_combos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- "아침 세트" and "아침 세트 " are the same name once trimmed by the API; case is ignored too.
CREATE UNIQUE INDEX IF NOT EXISTS meal_combos_name_key ON meal_combos (lower(name));

CREATE TABLE IF NOT EXISTS meal_combo_items (
  combo_id bigint NOT NULL REFERENCES meal_combos (id) ON DELETE CASCADE,
  -- Keeps the order the foods were put in.
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 20),
  -- There is no way to delete a food in the app; one removed in SQL leaves its combos too.
  food_id bigint NOT NULL REFERENCES foods (id) ON DELETE CASCADE,
  servings numeric(6, 2) NOT NULL CHECK (servings > 0 AND servings <= 999),
  PRIMARY KEY (combo_id, position),
  CONSTRAINT meal_combo_items_food_once UNIQUE (combo_id, food_id)
);

CREATE INDEX IF NOT EXISTS meal_combo_items_food_id_idx ON meal_combo_items (food_id);
