-- =============================================================================
-- MIGRATION: Infraestrutura vetorial para conciliação semântica assíncrona
-- =============================================================================

-- 1. Extensão pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Coluna de embedding em materials (768 dimensões = text-embedding-004)
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS embedding vector(768);

-- 3. Índice HNSW para busca por similaridade de cosseno
--    m=16 / ef_construction=64: precisão adequada para catálogos de até ~100k itens
CREATE INDEX IF NOT EXISTS idx_materials_embedding_hnsw
  ON materials USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- 4. RPC auxiliar: retorna IDs de materiais pertencentes a um orçamento
--    Esta é a "fonte da verdade" do escopo — usada tanto no L1 (memória exata)
--    quanto no L2 (busca vetorial) para garantir que nenhuma sugestão extrapole
--    os materiais previstos para a obra em questão.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_budget_material_ids(
  p_budget_id uuid
)
RETURNS TABLE (material_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Materiais em grupos de itens de postes
  SELECT DISTINCT pigm.material_id
  FROM post_item_group_materials pigm
  JOIN post_item_groups pig ON pig.id = pigm.post_item_group_id
  JOIN budget_posts bp      ON bp.id  = pig.budget_post_id
  WHERE bp.budget_id = p_budget_id

  UNION

  -- Materiais avulsos em postes
  SELECT DISTINCT pm.material_id
  FROM post_materials pm
  JOIN budget_posts bp ON bp.id = pm.post_id
  WHERE bp.budget_id = p_budget_id;
$$;

-- =============================================================================
-- 5. RPC principal: busca semântica por vetor filtrada pelo escopo do orçamento
--    current_budget_id DEFAULT NULL → fallback para escopo global do usuário
--    (útil para sessões de cotação sem orçamento vinculado)
-- =============================================================================
CREATE OR REPLACE FUNCTION match_materials_by_vector(
  query_embedding   vector(768),
  match_threshold   numeric,
  match_count       int,
  current_user_id   uuid,
  current_budget_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id         uuid,
  name       text,
  code       text,
  unit       text,
  price      numeric,
  similarity numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.name,
    m.code,
    m.unit,
    m.price,
    (1 - (m.embedding <=> query_embedding))::numeric AS similarity
  FROM materials m
  WHERE
    m.user_id = current_user_id
    AND m.active_in_supplies = true
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> query_embedding)) >= match_threshold
    AND (
      -- Sem budget_id: aceita todos os materiais ativos do usuário
      current_budget_id IS NULL
      -- Com budget_id: restringe ao escopo da obra (fonte da verdade)
      OR m.id IN (SELECT bmi.material_id FROM get_budget_material_ids(current_budget_id) bmi)
    )
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Permissões: authenticated pode invocar as RPCs; service_role já tem acesso implícito
GRANT EXECUTE ON FUNCTION get_budget_material_ids(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION match_materials_by_vector(vector, numeric, int, uuid, uuid) TO authenticated;
