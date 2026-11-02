-- Body measurements per day (#44). Any field may be empty: NULL means "not measured", never zero.
CREATE TABLE IF NOT EXISTS body_records (
  record_date date PRIMARY KEY,
  weight_kg numeric(5, 2) CHECK (weight_kg > 0 AND weight_kg <= 500),
  body_fat_percent numeric(5, 2) CHECK (body_fat_percent > 0 AND body_fat_percent <= 100),
  waist_cm numeric(5, 2) CHECK (waist_cm > 0 AND waist_cm <= 300),
  systolic_mmhg smallint CHECK (systolic_mmhg BETWEEN 50 AND 300),
  diastolic_mmhg smallint CHECK (diastolic_mmhg BETWEEN 20 AND 200),
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One blood pressure number alone says nothing, and imports may write here later.
  CONSTRAINT body_records_pressure_pair CHECK ((systolic_mmhg IS NULL) = (diastolic_mmhg IS NULL)),
  CONSTRAINT body_records_pressure_order CHECK (systolic_mmhg > diastolic_mmhg)
);
