-- Store the supplier/quotation that last updated the material catalog price.
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS price_source_supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS price_source_supplier_id UUID NULL REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_source_quote_id UUID NULL REFERENCES supplier_quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_source_session_id UUID NULL REFERENCES quotation_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_source_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_materials_price_source_supplier
  ON materials (user_id, price_source_supplier_id)
  WHERE price_source_supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_materials_price_source_session
  ON materials (user_id, price_source_session_id)
  WHERE price_source_session_id IS NOT NULL;
