-- =============================================================================
-- Módulo: Comparação de Fornecedores e Cenários de Compra
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. supplier_quotes — Cotação de fornecedor vinculada a um orçamento
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_quotes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id        UUID        NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  supplier_name    TEXT        NOT NULL,
  pdf_path         TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pendente'
                               CHECK (status IN ('pendente', 'conciliado', 'aprovado')),
  observacoes_gerais TEXT,
  user_id          UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE supplier_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_quotes_select" ON supplier_quotes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "supplier_quotes_insert" ON supplier_quotes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "supplier_quotes_update" ON supplier_quotes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "supplier_quotes_delete" ON supplier_quotes
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_supplier_quotes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_supplier_quotes_updated_at
  BEFORE UPDATE ON supplier_quotes
  FOR EACH ROW EXECUTE FUNCTION update_supplier_quotes_updated_at();

-- -----------------------------------------------------------------------------
-- 2. supplier_quote_items — Itens extraídos do PDF de cada cotação
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_quote_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id            UUID        NOT NULL REFERENCES supplier_quotes(id) ON DELETE CASCADE,
  descricao           TEXT        NOT NULL,
  unidade             TEXT        NOT NULL DEFAULT '',
  quantidade          NUMERIC     NOT NULL DEFAULT 0,
  preco_unit          NUMERIC     NOT NULL DEFAULT 0,
  total_item          NUMERIC     NOT NULL DEFAULT 0,
  ipi_percent         NUMERIC     NOT NULL DEFAULT 0,
  st_incluso          BOOLEAN     NOT NULL DEFAULT false,
  alerta              BOOLEAN     NOT NULL DEFAULT false,
  matched_material_id UUID        REFERENCES materials(id),
  conversion_factor   NUMERIC     NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
  match_status        TEXT        NOT NULL DEFAULT 'sem_match'
                                  CHECK (match_status IN ('sem_match', 'automatico', 'manual')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE supplier_quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_quote_items_select" ON supplier_quote_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM supplier_quotes sq
      WHERE sq.id = supplier_quote_items.quote_id AND sq.user_id = auth.uid()
    )
  );

CREATE POLICY "supplier_quote_items_insert" ON supplier_quote_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM supplier_quotes sq
      WHERE sq.id = supplier_quote_items.quote_id AND sq.user_id = auth.uid()
    )
  );

CREATE POLICY "supplier_quote_items_update" ON supplier_quote_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM supplier_quotes sq
      WHERE sq.id = supplier_quote_items.quote_id AND sq.user_id = auth.uid()
    )
  );

CREATE POLICY "supplier_quote_items_delete" ON supplier_quote_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM supplier_quotes sq
      WHERE sq.id = supplier_quote_items.quote_id AND sq.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 3. supplier_material_mappings — Memória De/Para por fornecedor
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_material_mappings (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  supplier_name           TEXT        NOT NULL,
  supplier_material_name  TEXT        NOT NULL,
  internal_material_id    UUID        NOT NULL REFERENCES materials(id),
  conversion_factor       NUMERIC     NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, supplier_name, supplier_material_name)
);

ALTER TABLE supplier_material_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_material_mappings_select" ON supplier_material_mappings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "supplier_material_mappings_insert" ON supplier_material_mappings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "supplier_material_mappings_update" ON supplier_material_mappings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "supplier_material_mappings_delete" ON supplier_material_mappings
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_supplier_material_mappings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_supplier_material_mappings_updated_at
  BEFORE UPDATE ON supplier_material_mappings
  FOR EACH ROW EXECUTE FUNCTION update_supplier_material_mappings_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Índices de performance
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_supplier_quotes_budget_id   ON supplier_quotes(budget_id);
CREATE INDEX IF NOT EXISTS idx_supplier_quotes_user_id     ON supplier_quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_supplier_quote_items_quote  ON supplier_quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_supplier_quote_items_status ON supplier_quote_items(match_status);
CREATE INDEX IF NOT EXISTS idx_supplier_mappings_lookup    ON supplier_material_mappings(user_id, supplier_name);
