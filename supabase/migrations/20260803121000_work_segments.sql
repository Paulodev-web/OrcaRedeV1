-- =============================================================================
-- SEGMENTOS DE OBRA — catálogo por usuário + marcação no orçamento
--
-- PROPÓSITO
--   Criar `work_segments` (Rede Energia, Iluminação, Ramais, Primária,
--   Secundária, Telecom…) e permitir marcar o segmento no orçamento, não na
--   proposta (Escopo §7.3). A resolução em cascata é responsabilidade da
--   aplicação:
--
--       grupo de item (override)  →  poste  →  "não segmentado"
--
--   Isso alimenta a seção "Valores Globais por Segmento" da proposta e fica
--   disponível para o Andamento de Obra no futuro.
--
-- ADITIVA (§3.3)
--   `budget_posts` e `post_item_groups` só ganham uma coluna NULL. Nenhuma
--   coluna existente muda. Os contratos do APK não leem `segment_id`, e como
--   ela é anulável nenhum INSERT do APK quebra.
--
-- NOTA DE INTEGRIDADE
--   `work_segments` é por usuário e `budget_posts` pertence a um orçamento que
--   é de um usuário. Não há constraint cruzando os dois (exigiria denormalizar
--   user_id no poste). O RLS de `work_segments` já impede que a UI ofereça o
--   segmento de outro usuário; a ligação errada só seria possível por escrita
--   direta na API com um id adivinhado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. work_segments — catálogo configurável por usuário
--    Mesmo padrão de public.material_subgroups (20260721120000).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_segments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  order_index INT         NOT NULL DEFAULT 0,
  is_default  BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_segments_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT work_segments_user_name_key UNIQUE (user_id, name)
);

COMMENT ON TABLE public.work_segments IS
  'Catálogo de segmentos de obra por usuário. Gerenciado em /configuracoes/segmentos.';

COMMENT ON COLUMN public.work_segments.is_default IS
  'true = item semeado pelo sistema no catálogo inicial. Não significa '
  '"segmento pré-selecionado": a resolução do segmento de um poste é '
  'grupo de item → poste → não segmentado, e não passa por aqui. Serve para a '
  'UI distinguir o catálogo padrão do que o usuário criou.';

COMMENT ON COLUMN public.work_segments.order_index IS
  'Ordem de exibição no catálogo e nas tabelas de valores por segmento da proposta.';

CREATE INDEX IF NOT EXISTS idx_work_segments_user_order
  ON public.work_segments (user_id, order_index, name);

CREATE OR REPLACE FUNCTION public.update_work_segments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_work_segments_updated_at ON public.work_segments;
CREATE TRIGGER trg_work_segments_updated_at
  BEFORE UPDATE ON public.work_segments
  FOR EACH ROW EXECUTE FUNCTION public.update_work_segments_updated_at();

-- -----------------------------------------------------------------------------
-- 1.1 RLS — work_segments
-- -----------------------------------------------------------------------------
ALTER TABLE public.work_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_segments_select" ON public.work_segments;
CREATE POLICY "work_segments_select" ON public.work_segments
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "work_segments_insert" ON public.work_segments;
CREATE POLICY "work_segments_insert" ON public.work_segments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "work_segments_update" ON public.work_segments;
CREATE POLICY "work_segments_update" ON public.work_segments
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "work_segments_delete" ON public.work_segments;
CREATE POLICY "work_segments_delete" ON public.work_segments
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 1.2 Seed do catálogo inicial para quem já tem orçamento
--     Precedente: o seed de material_subgroups em 20260721120000.
--     Usuário novo cadastra os seus; ninguém fica com catálogo vazio agora.
-- -----------------------------------------------------------------------------
INSERT INTO public.work_segments (user_id, name, order_index, is_default)
SELECT u.user_id, sg.name, sg.ord, true
FROM (SELECT DISTINCT user_id FROM public.budgets WHERE user_id IS NOT NULL) u
CROSS JOIN (VALUES
  ('Rede de Energia',      1),
  ('Rede Primária',        2),
  ('Rede Secundária',      3),
  ('Iluminação Pública',   4),
  ('Ramais de Ligação',    5),
  ('Telecomunicações',     6),
  ('Obras Civis',          7)
) AS sg(name, ord)
ON CONFLICT (user_id, name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. budget_posts.segment_id — segmento do poste
--    ON DELETE SET NULL: excluir um segmento do catálogo dessegmenta os postes
--    que o usavam, sem bloquear a exclusão (mesma escolha de materials.subgroup_id).
-- -----------------------------------------------------------------------------
ALTER TABLE public.budget_posts
  ADD COLUMN IF NOT EXISTS segment_id UUID NULL
    REFERENCES public.work_segments(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.budget_posts.segment_id IS
  'Segmento de obra do poste. NULL = não segmentado. Nível intermediário da '
  'cascata: post_item_groups.segment_id (override) → este → não segmentado.';

CREATE INDEX IF NOT EXISTS idx_budget_posts_segment
  ON public.budget_posts (segment_id)
  WHERE segment_id IS NOT NULL;

-- Agregação "postes por segmento dentro do orçamento".
CREATE INDEX IF NOT EXISTS idx_budget_posts_budget_segment
  ON public.budget_posts (budget_id, segment_id);

-- -----------------------------------------------------------------------------
-- 3. post_item_groups.segment_id — override do segmento do poste
-- -----------------------------------------------------------------------------
ALTER TABLE public.post_item_groups
  ADD COLUMN IF NOT EXISTS segment_id UUID NULL
    REFERENCES public.work_segments(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.post_item_groups.segment_id IS
  'Override do segmento para este grupo de itens. Quando preenchido, vence o '
  'segmento do poste. NULL = herda de budget_posts.segment_id.';

CREATE INDEX IF NOT EXISTS idx_post_item_groups_segment
  ON public.post_item_groups (segment_id)
  WHERE segment_id IS NOT NULL;
