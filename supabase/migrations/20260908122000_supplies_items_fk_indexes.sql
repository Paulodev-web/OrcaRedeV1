-- Índices que faltavam nas FKs para materials, apontados pelo linter depois da
-- migration de org_id.
--
-- A Conciliação lê supplier_quote_items com `materials (code, name, unit)`
-- aninhado e as sugestões com o material sugerido: sem índice, cada join volta a
-- varrer. Também evita varredura ao apagar ou reprecificar um material.
CREATE INDEX IF NOT EXISTS idx_supplier_quote_items_matched_material
  ON public.supplier_quote_items (matched_material_id)
  WHERE matched_material_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_semantic_suggestions_suggested_material
  ON public.semantic_match_suggestions (suggested_material_id);
