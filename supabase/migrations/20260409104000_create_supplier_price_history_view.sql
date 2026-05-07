-- =============================================================================
-- View: histórico de preços normalizados por material e fornecedor (RF06)
-- =============================================================================

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
WHERE sqi.match_status <> 'sem_match';
