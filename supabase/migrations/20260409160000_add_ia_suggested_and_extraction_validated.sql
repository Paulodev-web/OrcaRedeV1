-- =============================================================================
-- Adiciona status 'ia_suggested' ao match_status de supplier_quote_items
-- e campo extraction_validated_at em supplier_quotes para curadoria humana.
-- =============================================================================

-- 1. Expandir CHECK de match_status para incluir 'ia_suggested'
ALTER TABLE supplier_quote_items
  DROP CONSTRAINT IF EXISTS supplier_quote_items_match_status_check;

ALTER TABLE supplier_quote_items
  ADD CONSTRAINT supplier_quote_items_match_status_check
  CHECK (match_status IN ('sem_match', 'automatico', 'manual', 'ia_suggested'));

-- 2. Substituir índice parcial de pendentes para incluir ia_suggested
DROP INDEX IF EXISTS idx_supplier_quote_items_pending;

CREATE INDEX idx_supplier_quote_items_pending
  ON supplier_quote_items(quote_id)
  WHERE match_status IN ('sem_match', 'ia_suggested');

-- 3. Atualizar view de histórico de preços para excluir ia_suggested (não validado)
CREATE OR REPLACE VIEW supplier_price_history AS
SELECT
  sqi.matched_material_id  AS material_id,
  m.name                   AS material_name,
  m.code                   AS material_code,
  m.unit                   AS material_unit,
  sq.supplier_name,
  sq.session_id,
  sq.id                    AS quote_id,
  sqi.id                   AS item_id,
  sqi.preco_unit,
  sqi.conversion_factor,
  CASE
    WHEN sqi.conversion_factor > 0
    THEN sqi.preco_unit / sqi.conversion_factor
    ELSE sqi.preco_unit
  END                      AS preco_normalizado,
  sqi.unidade              AS supplier_unit,
  sqi.quantidade,
  sqi.match_method,
  sq.created_at            AS quoted_at
FROM supplier_quote_items sqi
JOIN supplier_quotes sq ON sq.id = sqi.quote_id
JOIN materials m ON m.id = sqi.matched_material_id
WHERE sqi.match_status IN ('automatico', 'manual');

-- 4. Adicionar coluna de validação de extração em supplier_quotes
ALTER TABLE supplier_quotes
  ADD COLUMN IF NOT EXISTS extraction_validated_at TIMESTAMPTZ;
