-- =============================================================================
-- Preço negociado (supplier_quote_items) + seleções do Cenário Ideal
-- =============================================================================

ALTER TABLE supplier_quote_items
  ADD COLUMN IF NOT EXISTS preco_negociado NUMERIC DEFAULT NULL;

ALTER TABLE supplier_quote_items
  DROP CONSTRAINT IF EXISTS supplier_quote_items_preco_negociado_nonneg;

ALTER TABLE supplier_quote_items
  ADD CONSTRAINT supplier_quote_items_preco_negociado_nonneg
  CHECK (preco_negociado IS NULL OR preco_negociado >= 0);

-- -----------------------------------------------------------------------------
-- scenario_ideal_selections — fornecedor escolhido manualmente por material/sessão
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenario_ideal_selections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES quotation_sessions(id) ON DELETE CASCADE,
  material_id UUID        NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quote_id    UUID        NOT NULL REFERENCES supplier_quotes(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (session_id, material_id, user_id)
);

ALTER TABLE scenario_ideal_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scenario_ideal_selections_select" ON scenario_ideal_selections
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "scenario_ideal_selections_insert" ON scenario_ideal_selections
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "scenario_ideal_selections_update" ON scenario_ideal_selections
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "scenario_ideal_selections_delete" ON scenario_ideal_selections
  FOR DELETE USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION update_scenario_ideal_selections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_scenario_ideal_selections_updated_at
  BEFORE UPDATE ON scenario_ideal_selections
  FOR EACH ROW EXECUTE FUNCTION update_scenario_ideal_selections_updated_at();

CREATE INDEX IF NOT EXISTS idx_scenario_ideal_selections_session
  ON scenario_ideal_selections(session_id);
