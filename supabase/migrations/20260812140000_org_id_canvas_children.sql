-- =============================================================================
-- ORG_ID NAS TABELAS-FILHAS DO CANVAS — conserta a lentidão de produção
--
-- O DIAGNÓSTICO (medido em prod, 12/08/2026, com EXPLAIN ANALYZE como usuário
-- autenticado real)
--
--   Carregar os materiais de UM orçamento de 280 postes:
--     828 ms · 5.821 linhas · 114.651 buffers
--
--   O plano mostrava uma cadeia de RLS de QUATRO níveis reavaliada POR LINHA:
--
--     post_item_group_materials      (5.821 linhas)
--       └─ dispara RLS de post_item_groups     loops=5821
--           └─ dispara RLS de budget_posts     loops=5821
--               └─ dispara RLS de budgets      loops=5821
--
-- POR QUE ISSO NASCEU
--   `20260807140000_org_rls_flip.sql` converteu as 33 tabelas-RAIZ para
--   `org_id = current_org_id()` — comparação indexada, um InitPlan por query.
--   As tabelas-FILHAS do canvas ficaram com a política original, de antes da
--   camada de org:
--
--     EXISTS (SELECT 1 FROM budgets WHERE id = ... AND user_id = auth.uid())
--
--   Antes do flip, `budgets` tinha uma policy trivial e essa cadeia era barata.
--   Depois do flip, o pai ficou caro — e cada filha passou a pagar esse custo
--   uma vez por linha, multiplicado pela profundidade da cadeia. Em dev
--   (dezenas de linhas) é invisível; em produção, com 98.252
--   post_item_group_materials, é o que trava o sistema.
--
-- O BUG DE CORREÇÃO QUE VEM JUNTO
--   O predicado efetivo hoje é `org_id = current_org_id() AND user_id =
--   auth.uid()`: a pessoa enxerga os ORÇAMENTOS da organização, mas só os
--   POSTES dos que ela mesma criou. Está latente porque hoje há um único dono
--   por org (verificado); passa a valer no dia em que duas pessoas criarem
--   orçamentos na mesma org — exatamente o cenário para o qual a camada de org
--   foi construída.
--
-- A CORREÇÃO
--   O mesmo padrão já provado nas tabelas-raiz: `org_id` próprio, derivado por
--   trigger, e policy de comparação direta. Zero aninhamento, zero subconsulta,
--   um único InitPlan por query.
--
-- ESCOPO — as 4 tabelas do canvas, que são as comprovadamente quentes no
--   pg_stat_statements. Ficam de fora, conscientemente:
--     · post_connections      — pende de work_trackings, não de budgets
--                               (outra cadeia), e tem 81 linhas.
--     · finalized_budget_items — mesmo defeito, mas o pai (finalized_budgets)
--                               JÁ tem org_id, então a cadeia é de um nível só
--                               e são 6.074 linhas. Merece migration própria.
--
-- SEM MUDANÇA DE CÓDIGO NA APLICAÇÃO: o `org_id` é derivado do pai por trigger
-- BEFORE INSERT, então todo INSERT existente continua funcionando sem passar a
-- coluna.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Coluna org_id (nullable por ora — o backfill preenche, o passo 3 trava)
-- -----------------------------------------------------------------------------
ALTER TABLE public.budget_posts
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.post_item_groups
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.post_materials
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.post_item_group_materials
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

COMMENT ON COLUMN public.budget_posts.org_id IS
  'Organização dona, desnormalizada de budgets. Existe para que a policy de RLS '
  'seja uma comparação direta em vez de um EXISTS que dispara a RLS do pai em '
  'cascata. Preenchida por trigger — a aplicação não precisa enviá-la.';

-- -----------------------------------------------------------------------------
-- 2. Backfill — de cima para baixo, cada nível herdando do já preenchido
-- -----------------------------------------------------------------------------
UPDATE public.budget_posts bp
   SET org_id = b.org_id
  FROM public.budgets b
 WHERE b.id = bp.budget_id
   AND bp.org_id IS DISTINCT FROM b.org_id;

UPDATE public.post_item_groups pig
   SET org_id = bp.org_id
  FROM public.budget_posts bp
 WHERE bp.id = pig.budget_post_id
   AND pig.org_id IS DISTINCT FROM bp.org_id;

UPDATE public.post_materials pm
   SET org_id = bp.org_id
  FROM public.budget_posts bp
 WHERE bp.id = pm.post_id
   AND pm.org_id IS DISTINCT FROM bp.org_id;

UPDATE public.post_item_group_materials pigm
   SET org_id = pig.org_id
  FROM public.post_item_groups pig
 WHERE pig.id = pigm.post_item_group_id
   AND pigm.org_id IS DISTINCT FROM pig.org_id;

-- -----------------------------------------------------------------------------
-- 3. Portão de integridade
--
--    Se sobrou linha órfã (filha sem pai), ela ficaria com org_id NULL e —
--    depois da troca de policy — INVISÍVEL para todo mundo. Melhor abortar a
--    migration inteira e investigar do que apagar dado em silêncio. Como tudo
--    aqui roda numa transação só, a falha desfaz até o ALTER TABLE e o banco
--    continua exatamente como estava.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_orfas RECORD;
BEGIN
  FOR v_orfas IN
    SELECT 'budget_posts' AS t, count(*) AS n FROM public.budget_posts WHERE org_id IS NULL
    UNION ALL
    SELECT 'post_item_groups', count(*) FROM public.post_item_groups WHERE org_id IS NULL
    UNION ALL
    SELECT 'post_materials', count(*) FROM public.post_materials WHERE org_id IS NULL
    UNION ALL
    SELECT 'post_item_group_materials', count(*) FROM public.post_item_group_materials WHERE org_id IS NULL
  LOOP
    IF v_orfas.n > 0 THEN
      RAISE EXCEPTION
        'Migration abortada: % linha(s) órfã(s) em public.% ficariam sem org_id e invisíveis. Investigue os registros sem pai antes de aplicar.',
        v_orfas.n, v_orfas.t;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.budget_posts              ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.post_item_groups          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.post_materials            ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.post_item_group_materials ALTER COLUMN org_id SET NOT NULL;

-- Índice em org_id: cobre a FK nova (senão o linter aponta unindexed_foreign_key)
-- e serve as varreduras por organização.
CREATE INDEX IF NOT EXISTS idx_budget_posts_org              ON public.budget_posts (org_id);
CREATE INDEX IF NOT EXISTS idx_post_item_groups_org          ON public.post_item_groups (org_id);
CREATE INDEX IF NOT EXISTS idx_post_materials_org            ON public.post_materials (org_id);
CREATE INDEX IF NOT EXISTS idx_post_item_group_materials_org ON public.post_item_group_materials (org_id);

-- -----------------------------------------------------------------------------
-- 4. Triggers que derivam org_id do pai
--
--    SECURITY DEFINER: a consulta ao pai não deve disparar a RLS do pai — era
--    justamente esse aninhamento que estávamos eliminando. Também evita que um
--    INSERT legítimo falhe porque o pai está fora do alcance da policy no
--    instante da checagem.
--
--    EXECUTE revogado: função SECURITY DEFINER não pode virar RPC via PostgREST.
--
--    Dispara em INSERT e no UPDATE que troca o pai — mover um poste de
--    orçamento tem de mover o org_id junto, senão a linha some da tela.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.budget_posts_set_org_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT b.org_id INTO NEW.org_id FROM public.budgets b WHERE b.id = NEW.budget_id;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'Orçamento % não encontrado ou sem organização.', NEW.budget_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.budget_posts_set_org_id() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.post_item_groups_set_org_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT bp.org_id INTO NEW.org_id FROM public.budget_posts bp WHERE bp.id = NEW.budget_post_id;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'Poste % não encontrado ou sem organização.', NEW.budget_post_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.post_item_groups_set_org_id() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.post_materials_set_org_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT bp.org_id INTO NEW.org_id FROM public.budget_posts bp WHERE bp.id = NEW.post_id;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'Poste % não encontrado ou sem organização.', NEW.post_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.post_materials_set_org_id() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.post_item_group_materials_set_org_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT pig.org_id INTO NEW.org_id FROM public.post_item_groups pig WHERE pig.id = NEW.post_item_group_id;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'Grupo de itens % não encontrado ou sem organização.', NEW.post_item_group_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.post_item_group_materials_set_org_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_budget_posts_set_org_id ON public.budget_posts;
CREATE TRIGGER trg_budget_posts_set_org_id
  BEFORE INSERT OR UPDATE OF budget_id ON public.budget_posts
  FOR EACH ROW EXECUTE FUNCTION public.budget_posts_set_org_id();

DROP TRIGGER IF EXISTS trg_post_item_groups_set_org_id ON public.post_item_groups;
CREATE TRIGGER trg_post_item_groups_set_org_id
  BEFORE INSERT OR UPDATE OF budget_post_id ON public.post_item_groups
  FOR EACH ROW EXECUTE FUNCTION public.post_item_groups_set_org_id();

DROP TRIGGER IF EXISTS trg_post_materials_set_org_id ON public.post_materials;
CREATE TRIGGER trg_post_materials_set_org_id
  BEFORE INSERT OR UPDATE OF post_id ON public.post_materials
  FOR EACH ROW EXECUTE FUNCTION public.post_materials_set_org_id();

DROP TRIGGER IF EXISTS trg_post_item_group_materials_set_org_id ON public.post_item_group_materials;
CREATE TRIGGER trg_post_item_group_materials_set_org_id
  BEFORE INSERT OR UPDATE OF post_item_group_id ON public.post_item_group_materials
  FOR EACH ROW EXECUTE FUNCTION public.post_item_group_materials_set_org_id();

-- -----------------------------------------------------------------------------
-- 5. Policies — a troca que elimina o aninhamento
--
--    O INSERT confere `org_id = current_org_id()` sobre o valor que o trigger
--    JÁ derivou do pai. Isso é mais forte do que parece: inserir um filho sob
--    um pai de outra organização faz o trigger gravar o org_id daquela outra
--    org, e o WITH CHECK reprova. Guarda de integridade sem nenhum EXISTS.
--
--    `TO authenticated` sempre — nunca `public`/`anon` (lição do rls_flip, que
--    já quebrou a página pública de propostas uma vez).
-- -----------------------------------------------------------------------------

-- ---- budget_posts ----
DROP POLICY IF EXISTS "Users can only see posts from their own budgets"   ON public.budget_posts;
DROP POLICY IF EXISTS "Users can only insert posts in their own budgets"  ON public.budget_posts;
DROP POLICY IF EXISTS "Users can only update posts in their own budgets"  ON public.budget_posts;
DROP POLICY IF EXISTS "Users can only delete posts from their own budgets" ON public.budget_posts;

CREATE POLICY "budget_posts_select" ON public.budget_posts
  FOR SELECT TO authenticated USING (org_id = (SELECT public.current_org_id()));
CREATE POLICY "budget_posts_insert" ON public.budget_posts
  FOR INSERT TO authenticated WITH CHECK (org_id = (SELECT public.current_org_id()));
CREATE POLICY "budget_posts_update" ON public.budget_posts
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT public.current_org_id()))
  WITH CHECK (org_id = (SELECT public.current_org_id()));
CREATE POLICY "budget_posts_delete" ON public.budget_posts
  FOR DELETE TO authenticated USING (org_id = (SELECT public.current_org_id()));

-- ---- post_item_groups ----
DROP POLICY IF EXISTS "Users can only see groups from their own posts"    ON public.post_item_groups;
DROP POLICY IF EXISTS "Users can only insert groups in their own posts"   ON public.post_item_groups;
DROP POLICY IF EXISTS "Users can only update groups in their own posts"   ON public.post_item_groups;
DROP POLICY IF EXISTS "Users can only delete groups from their own posts" ON public.post_item_groups;

CREATE POLICY "post_item_groups_select" ON public.post_item_groups
  FOR SELECT TO authenticated USING (org_id = (SELECT public.current_org_id()));
CREATE POLICY "post_item_groups_insert" ON public.post_item_groups
  FOR INSERT TO authenticated WITH CHECK (org_id = (SELECT public.current_org_id()));
CREATE POLICY "post_item_groups_update" ON public.post_item_groups
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT public.current_org_id()))
  WITH CHECK (org_id = (SELECT public.current_org_id()));
CREATE POLICY "post_item_groups_delete" ON public.post_item_groups
  FOR DELETE TO authenticated USING (org_id = (SELECT public.current_org_id()));

-- ---- post_materials ----
DROP POLICY IF EXISTS "Users can only see loose materials from their own posts"    ON public.post_materials;
DROP POLICY IF EXISTS "Users can only insert loose materials in their own posts"   ON public.post_materials;
DROP POLICY IF EXISTS "Users can only update loose materials in their own posts"   ON public.post_materials;
DROP POLICY IF EXISTS "Users can only delete loose materials from their own posts" ON public.post_materials;

CREATE POLICY "post_materials_select" ON public.post_materials
  FOR SELECT TO authenticated USING (org_id = (SELECT public.current_org_id()));
CREATE POLICY "post_materials_insert" ON public.post_materials
  FOR INSERT TO authenticated WITH CHECK (org_id = (SELECT public.current_org_id()));
CREATE POLICY "post_materials_update" ON public.post_materials
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT public.current_org_id()))
  WITH CHECK (org_id = (SELECT public.current_org_id()));
CREATE POLICY "post_materials_delete" ON public.post_materials
  FOR DELETE TO authenticated USING (org_id = (SELECT public.current_org_id()));

-- ---- post_item_group_materials ----
DROP POLICY IF EXISTS "Users can only see group materials from their own posts"    ON public.post_item_group_materials;
DROP POLICY IF EXISTS "Users can only insert group materials in their own posts"   ON public.post_item_group_materials;
DROP POLICY IF EXISTS "Users can only update group materials in their own posts"   ON public.post_item_group_materials;
DROP POLICY IF EXISTS "Users can only delete group materials from their own posts" ON public.post_item_group_materials;

CREATE POLICY "post_item_group_materials_select" ON public.post_item_group_materials
  FOR SELECT TO authenticated USING (org_id = (SELECT public.current_org_id()));
CREATE POLICY "post_item_group_materials_insert" ON public.post_item_group_materials
  FOR INSERT TO authenticated WITH CHECK (org_id = (SELECT public.current_org_id()));
CREATE POLICY "post_item_group_materials_update" ON public.post_item_group_materials
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT public.current_org_id()))
  WITH CHECK (org_id = (SELECT public.current_org_id()));
CREATE POLICY "post_item_group_materials_delete" ON public.post_item_group_materials
  FOR DELETE TO authenticated USING (org_id = (SELECT public.current_org_id()));

-- -----------------------------------------------------------------------------
-- 6. Estatísticas frescas — o planner precisa saber que org_id existe e é
--    seletiva, senão continua escolhendo o plano antigo por um tempo.
-- -----------------------------------------------------------------------------
ANALYZE public.budget_posts;
ANALYZE public.post_item_groups;
ANALYZE public.post_materials;
ANALYZE public.post_item_group_materials;
