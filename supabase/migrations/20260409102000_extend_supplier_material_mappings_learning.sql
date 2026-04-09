-- =============================================================================
-- Expande supplier_material_mappings com metadados de aprendizado
-- para rastrear origem (manual vs IA) e frequência de uso.
-- =============================================================================

ALTER TABLE supplier_material_mappings
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS times_used integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS confidence_snapshot numeric(5,2);

ALTER TABLE supplier_material_mappings
  ADD CONSTRAINT supplier_material_mappings_source_chk
  CHECK (source IN ('manual', 'ai'));

ALTER TABLE supplier_material_mappings
  ADD CONSTRAINT supplier_material_mappings_times_used_chk
  CHECK (times_used >= 0);

-- Índice para buscas de auto-match (normalização lowercase)
CREATE INDEX IF NOT EXISTS idx_supplier_mappings_name_lower
  ON supplier_material_mappings(user_id, supplier_name, lower(supplier_material_name));
