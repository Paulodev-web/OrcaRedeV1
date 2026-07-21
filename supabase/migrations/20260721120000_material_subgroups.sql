-- Converte materials.subgroup (TEXT com CHECK fixo de 15 valores) em uma
-- entidade relacional gerenciável pelo usuário (tabela material_subgroups),
-- preservando as classificações existentes via backfill.

CREATE TABLE public.material_subgroups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_subgroups_user_name_key UNIQUE (user_id, name)
);

CREATE INDEX material_subgroups_user_id_idx ON public.material_subgroups(user_id);

ALTER TABLE public.material_subgroups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own material subgroups" ON public.material_subgroups
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own material subgroups" ON public.material_subgroups
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own material subgroups" ON public.material_subgroups
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own material subgroups" ON public.material_subgroups
  FOR DELETE USING (auth.uid() = user_id);

-- Seed: os 15 valores antigos, um conjunto por cada user_id distinto já
-- presente em materials (só quem já tem materiais precisa do catálogo pronto
-- para o backfill; novos usuários cadastram os subgrupos que quiserem).
INSERT INTO public.material_subgroups (name, user_id)
SELECT sg.name, u.user_id
FROM (SELECT DISTINCT user_id FROM public.materials WHERE user_id IS NOT NULL) u
CROSS JOIN (VALUES
  ('POSTE'), ('AMARRAÇÃO'), ('PRÉ FORMADO'), ('CIVIL'), ('FERRAGEM'),
  ('POLIMÉRICO'), ('ILUMINAÇÃO'), ('CONDUTOR'), ('ATERRAMENTO'), ('PROTEÇÃO'),
  ('CONEXÃO'), ('CABO DE AÇO'), ('CRUZETA'), ('ISOLAÇÃO'), ('OUTROS')
) AS sg(name)
ON CONFLICT (user_id, name) DO NOTHING;

-- Nova coluna relacional em materials. ON DELETE SET NULL: excluir um
-- subgrupo desclassifica os materiais que o usavam, sem bloquear a exclusão.
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS subgroup_id uuid REFERENCES public.material_subgroups(id) ON DELETE SET NULL;

-- Backfill casado por user_id + nome, para não ligar material de um usuário
-- a um subgrupo de outro usuário.
UPDATE public.materials m
SET subgroup_id = ms.id
FROM public.material_subgroups ms
WHERE m.subgroup IS NOT NULL
  AND ms.user_id = m.user_id
  AND ms.name = m.subgroup;

CREATE INDEX IF NOT EXISTS idx_materials_user_subgroup_id
  ON public.materials (user_id, subgroup_id);

-- Remove o CHECK e o índice antigos, atrelados à lista fixa de valores.
-- A coluna materials.subgroup (TEXT) é mantida como histórico/auditoria;
-- uma migration de limpeza futura pode dropá-la após validar em produção.
ALTER TABLE public.materials DROP CONSTRAINT IF EXISTS materials_subgroup_check;
DROP INDEX IF EXISTS public.idx_materials_user_subgroup;
