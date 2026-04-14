-- =============================================================================
-- Estoque manual por sessão/material — entrada do usuário para cálculo de
-- necessidade líquida nos cenários de compra.
-- =============================================================================

CREATE TABLE IF NOT EXISTS session_material_stock_inputs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES quotation_sessions(id) ON DELETE CASCADE,
  material_id UUID        NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_qty   NUMERIC     NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (session_id, material_id, user_id)
);

ALTER TABLE session_material_stock_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_material_stock_inputs_select" ON session_material_stock_inputs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "session_material_stock_inputs_insert" ON session_material_stock_inputs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "session_material_stock_inputs_update" ON session_material_stock_inputs
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "session_material_stock_inputs_delete" ON session_material_stock_inputs
  FOR DELETE USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION update_stock_inputs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_inputs_updated_at
  BEFORE UPDATE ON session_material_stock_inputs
  FOR EACH ROW EXECUTE FUNCTION update_stock_inputs_updated_at();

CREATE INDEX IF NOT EXISTS idx_stock_inputs_session
  ON session_material_stock_inputs(session_id);
