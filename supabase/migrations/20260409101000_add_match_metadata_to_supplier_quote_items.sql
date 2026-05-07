-- =============================================================================
-- Adiciona metadados de match (nível, confiança, método) a supplier_quote_items
-- para suportar a cascata de conciliação em 2 níveis.
-- =============================================================================

ALTER TABLE supplier_quote_items
  ADD COLUMN IF NOT EXISTS match_level smallint,
  ADD COLUMN IF NOT EXISTS match_confidence numeric(5,2),
  ADD COLUMN IF NOT EXISTS match_method text;

-- match_level: 1 = memória exata, 2 = IA semântica, NULL = ainda sem match ou manual
COMMENT ON COLUMN supplier_quote_items.match_level IS '1=memoria_exata, 2=ia_semantica';

-- match_method: granularidade da origem do match
ALTER TABLE supplier_quote_items
  ADD CONSTRAINT supplier_quote_items_match_method_chk
  CHECK (match_method IS NULL OR match_method IN ('exact_memory', 'semantic_ai', 'manual'));

-- match_confidence: score 0-100 (relevante para IA)
ALTER TABLE supplier_quote_items
  ADD CONSTRAINT supplier_quote_items_match_confidence_chk
  CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 100));

-- Backfill: itens já conciliados como 'automatico' são memória exata (nível 1)
UPDATE supplier_quote_items
  SET match_level = 1,
      match_method = 'exact_memory',
      match_confidence = 100
  WHERE match_status = 'automatico'
    AND match_method IS NULL;

-- Backfill: itens manuais
UPDATE supplier_quote_items
  SET match_method = 'manual'
  WHERE match_status = 'manual'
    AND match_method IS NULL;

-- Índices para consultas de pendências e filtragem por método
CREATE INDEX IF NOT EXISTS idx_supplier_quote_items_match_method
  ON supplier_quote_items(match_method);

CREATE INDEX IF NOT EXISTS idx_supplier_quote_items_pending
  ON supplier_quote_items(quote_id)
  WHERE match_status = 'sem_match';
