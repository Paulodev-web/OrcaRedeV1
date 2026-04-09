-- =============================================================================
-- Tabela de sugestões de match semântico (IA) — auditoria e revisão
-- =============================================================================

CREATE TABLE IF NOT EXISTS semantic_match_suggestions (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_quote_item_id      UUID        NOT NULL REFERENCES supplier_quote_items(id) ON DELETE CASCADE,
  suggested_material_id       UUID        NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  suggested_conversion_factor NUMERIC     NOT NULL DEFAULT 1 CHECK (suggested_conversion_factor > 0),
  confidence_score            NUMERIC(5,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
  rationale                   TEXT,
  status                      TEXT        NOT NULL DEFAULT 'suggested'
                                          CHECK (status IN ('suggested', 'accepted', 'rejected')),
  model                       TEXT        NOT NULL DEFAULT 'gemini-2.5-flash',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at                 TIMESTAMPTZ
);

ALTER TABLE semantic_match_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "semantic_match_suggestions_select" ON semantic_match_suggestions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM supplier_quote_items sqi
      JOIN supplier_quotes sq ON sq.id = sqi.quote_id
      WHERE sqi.id = semantic_match_suggestions.supplier_quote_item_id
        AND sq.user_id = auth.uid()
    )
  );

CREATE POLICY "semantic_match_suggestions_insert" ON semantic_match_suggestions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM supplier_quote_items sqi
      JOIN supplier_quotes sq ON sq.id = sqi.quote_id
      WHERE sqi.id = semantic_match_suggestions.supplier_quote_item_id
        AND sq.user_id = auth.uid()
    )
  );

CREATE POLICY "semantic_match_suggestions_update" ON semantic_match_suggestions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM supplier_quote_items sqi
      JOIN supplier_quotes sq ON sq.id = sqi.quote_id
      WHERE sqi.id = semantic_match_suggestions.supplier_quote_item_id
        AND sq.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_semantic_suggestions_item
  ON semantic_match_suggestions(supplier_quote_item_id);

CREATE INDEX IF NOT EXISTS idx_semantic_suggestions_status
  ON semantic_match_suggestions(status)
  WHERE status = 'suggested';
