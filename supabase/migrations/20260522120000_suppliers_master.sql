-- =============================================================================
-- Cadastro mestre de fornecedores + vínculo em cotações e jobs de extração
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. suppliers — Cadastro de fornecedores por usuário
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id),
  name            TEXT        NOT NULL,
  cnpj            TEXT,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  sales_contact   TEXT,
  payment_terms   TEXT,
  notes           TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select" ON suppliers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "suppliers_insert" ON suppliers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "suppliers_update" ON suppliers
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_suppliers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_suppliers_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_user_name_active
  ON suppliers (user_id, lower(trim(name)))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_suppliers_user_active
  ON suppliers (user_id, is_active);

-- -----------------------------------------------------------------------------
-- 2. supplier_quotes — FK para fornecedor cadastrado
-- -----------------------------------------------------------------------------
ALTER TABLE supplier_quotes
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_supplier_quotes_supplier_id
  ON supplier_quotes (supplier_id);

-- -----------------------------------------------------------------------------
-- 3. extraction_jobs — FK para fornecedor escolhido no upload
-- -----------------------------------------------------------------------------
ALTER TABLE extraction_jobs
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_supplier_id
  ON extraction_jobs (supplier_id);
