-- Soft-disable materials for the Suprimentos module (orçamento unchanged).
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS active_in_supplies BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_materials_user_active_supplies
  ON materials (user_id, active_in_supplies)
  WHERE active_in_supplies = true;
