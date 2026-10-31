-- Foods with nutrition per serving and where the numbers came from (docs/food-data.md).
-- A NULL nutrient means "not known", never zero.
CREATE TABLE IF NOT EXISTS foods (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  brand text,
  category text,
  serving_size numeric(8, 2) NOT NULL CHECK (serving_size > 0),
  serving_unit text NOT NULL,
  calories numeric(8, 2) CHECK (calories >= 0),
  carbs numeric(8, 2) CHECK (carbs >= 0),
  protein numeric(8, 2) CHECK (protein >= 0),
  fat numeric(8, 2) CHECK (fat >= 0),
  sugars numeric(8, 2) CHECK (sugars >= 0),
  sodium numeric(8, 2) CHECK (sodium >= 0),
  source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('official', 'label', 'public', 'estimate', 'manual')),
  source_url text,
  checked_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Researched data re-runs safely through ON CONFLICT on this index.
CREATE UNIQUE INDEX IF NOT EXISTS foods_name_brand_key ON foods (name, COALESCE(brand, ''));
