-- =============================================================================
-- Data da cotação no PDF + índices para histórico por fornecedor
-- =============================================================================

ALTER TABLE supplier_quotes
  ADD COLUMN IF NOT EXISTS quote_date DATE NULL;

COMMENT ON COLUMN supplier_quotes.quote_date IS
  'Data da cotação/proposta extraída do PDF (quando disponível).';

CREATE INDEX IF NOT EXISTS idx_supplier_quotes_supplier_history
  ON supplier_quotes (user_id, supplier_id, quote_date DESC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_supplier_history
  ON extraction_jobs (user_id, supplier_id, created_at DESC);

-- View de histórico de preços: usa quote_date quando existir
DROP VIEW IF EXISTS supplier_price_history;

CREATE VIEW supplier_price_history
WITH (security_invoker = true)
AS
SELECT
  sqi.matched_material_id  AS material_id,
  m.name                   AS material_name,
  m.code                   AS material_code,
  m.unit                   AS material_unit,
  sq.supplier_name,
  sq.supplier_id,
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
  COALESCE(sq.quote_date::timestamptz, sq.created_at) AS quoted_at
FROM supplier_quote_items sqi
JOIN supplier_quotes sq ON sq.id = sqi.quote_id
JOIN materials m ON m.id = sqi.matched_material_id
WHERE sqi.match_status <> 'sem_match';
