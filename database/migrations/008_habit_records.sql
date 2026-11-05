-- Drinking and smoking per day (#36).
-- NULL cigarettes means "not recorded", 0 means "did not smoke". For drinks, drinks_recorded says
-- whether the day was recorded at all: recorded with no rows below means "did not drink".
CREATE TABLE IF NOT EXISTS habit_days (
  record_date date PRIMARY KEY,
  cigarettes smallint CHECK (cigarettes BETWEEN 0 AND 200),
  drinks_recorded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A day with nothing recorded is no row at all.
  CONSTRAINT habit_days_not_empty CHECK (cigarettes IS NOT NULL OR drinks_recorded)
);

-- One row per kind and unit drunk that day, in the order they were entered.
CREATE TABLE IF NOT EXISTS habit_drinks (
  record_date date NOT NULL REFERENCES habit_days (record_date) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 19),
  kind text NOT NULL CHECK (kind IN ('soju', 'beer', 'wine', 'makgeolli', 'whisky', 'other')),
  unit text NOT NULL CHECK (unit IN ('glass', 'bottle', 'can')),
  amount numeric(5, 2) NOT NULL CHECK (amount > 0 AND amount <= 99),
  PRIMARY KEY (record_date, position),
  CONSTRAINT habit_drinks_kind_unit_once UNIQUE (record_date, kind, unit)
);
