-- =============================================================================
-- scenario_purchase_orders — número da OC (Ordem de Compra) por material/sessão
-- Marca que o material já foi comprado no Cenário Ideal.
-- =============================================================================

CREATE TABLE IF NOT EXISTS scenario_purchase_orders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES quotation_sessions(id) ON DELETE CASCADE,
  material_id UUID        NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  oc_number   TEXT        NOT NULL,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (session_id, material_id, user_id)
);

ALTER TABLE scenario_purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scenario_purchase_orders_select" ON scenario_purchase_orders
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "scenario_purchase_orders_insert" ON scenario_purchase_orders
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "scenario_purchase_orders_update" ON scenario_purchase_orders
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "scenario_purchase_orders_delete" ON scenario_purchase_orders
  FOR DELETE USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION update_scenario_purchase_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_scenario_purchase_orders_updated_at
  BEFORE UPDATE ON scenario_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_scenario_purchase_orders_updated_at();

CREATE INDEX IF NOT EXISTS idx_scenario_purchase_orders_session
  ON scenario_purchase_orders(session_id);
