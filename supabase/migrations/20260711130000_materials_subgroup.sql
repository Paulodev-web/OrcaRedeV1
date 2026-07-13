-- Classificação de subgrupo dos materiais (POSTE, CRUZETA, CONDUTOR, etc.)
-- para filtros no catálogo e como alvo da classificação por IA (Gemini).
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS subgroup TEXT;

ALTER TABLE materials
  DROP CONSTRAINT IF EXISTS materials_subgroup_check;

ALTER TABLE materials
  ADD CONSTRAINT materials_subgroup_check
  CHECK (
    subgroup IS NULL OR subgroup IN (
      'POSTE', 'AMARRAÇÃO', 'PRÉ FORMADO', 'CIVIL', 'FERRAGEM', 'POLIMÉRICO',
      'ILUMINAÇÃO', 'CONDUTOR', 'ATERRAMENTO', 'PROTEÇÃO', 'CONEXÃO',
      'CABO DE AÇO', 'CRUZETA', 'ISOLAÇÃO', 'OUTROS'
    )
  );

CREATE INDEX IF NOT EXISTS idx_materials_user_subgroup
  ON materials (user_id, subgroup);
