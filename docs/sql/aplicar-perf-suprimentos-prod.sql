-- =============================================================================
-- SUPRIMENTOS E COTAÇÃO: performance. Script único para rodar em PRODUÇÃO.
--
-- É a concatenação, na ordem, das três migrations que já estão no repositório:
--   supabase/migrations/20260908120000_supplies_budget_bom_functions.sql
--   supabase/migrations/20260908121000_supplies_items_org_rls.sql
--   supabase/migrations/20260908122000_supplies_items_fk_indexes.sql
--
-- COMO RODAR
--   Cole o arquivo INTEIRO de uma vez no SQL Editor do dashboard e execute.
--   Rodando de uma vez só, o Postgres trata tudo como uma transação: se
--   qualquer passo falhar, nada é aplicado e o banco fica exatamente como
--   estava. Não rode em pedaços, senão essa garantia se perde.
--
-- O QUE ESPERAR
--   Segundos. O passo mais pesado é o backfill de org_id em
--   supplier_quote_items, que trava a tabela para escrita enquanto roda: evite
--   fazer no meio de uma extração de PDF.
--
--   Se aparecer "Migration abortada: N linha(s) órfã(s)", PARE e me chame. Quer
--   dizer que existe item de cotação sem cotação pai, e a transação já se
--   desfez sozinha.
--
-- ANTES DE RODAR
--   O código novo depende das funções criadas na parte 1, e a parte 2 muda quem
--   enxerga o quê. O certo é rodar este script e publicar o deploy juntos.
--
-- DEPOIS DE RODAR
--   As conferências estão no fim do arquivo, comentadas.
-- =============================================================================


-- =============================================================================
-- PARTE: 20260908120000_supplies_budget_bom_functions
-- =============================================================================

-- Suprimentos: consolidação do BOM feita no banco, não no Node.
--
-- Antes, todo caminho que precisava da lista de materiais de um orçamento
-- (abrir Conciliação, abrir Cenários, e pior, CADA vínculo manual salvo)
-- carregava budget_posts com post_item_groups, post_item_group_materials,
-- post_materials e materials aninhados, e agregava em JavaScript. No maior
-- orçamento da base isso são 7.623 linhas e ~1,4 MB de dados brutos para
-- produzir uma lista de 100 materiais.
--
-- Paridade com consolidateMaterialsFromBudgetDetails
-- (src/services/budgetMaterialAggregation.ts):
--   quantidade   = soma de grupos + avulsos
--   preço unit.  = primeiro registro encontrado
--   grupo cai para materials.price quando price_at_addition é nulo ou zero;
--   avulso não cai (fica 0), assimetria que existe no JS e foi preservada.
--
-- Diferença deliberada: no JS o "primeiro registro" dependia da ordem em que o
-- PostgREST devolvia grupos e materiais, que não é determinística (nenhum
-- order by cobre os níveis aninhados). Em 245 de 7.981 pares orçamento/material
-- o mesmo material aparece com price_at_addition diferente em postes
-- diferentes, e nesses casos o preço exibido era sorteio. Aqui a regra é fixa:
-- menor counter de poste, grupo antes de avulso.
create or replace function public.budget_consolidated_materials(p_budget_id uuid)
returns table (
  material_id uuid,
  code text,
  name text,
  unit text,
  required_qty numeric,
  unit_price numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with linhas as (
    select bp.counter, 0 as fonte, pigm.material_id, pigm.quantity as qty,
           coalesce(nullif(pigm.price_at_addition, 0), m.price, 0) as preco
    from budget_posts bp
    join post_item_groups pig on pig.budget_post_id = bp.id
    join post_item_group_materials pigm on pigm.post_item_group_id = pig.id
    join materials m on m.id = pigm.material_id
    where bp.budget_id = p_budget_id
    union all
    select bp.counter, 1, pm.material_id, pm.quantity,
           coalesce(nullif(pm.price_at_addition, 0), 0)
    from budget_posts bp
    join post_materials pm on pm.post_id = bp.id
    where bp.budget_id = p_budget_id
  )
  select l.material_id, m.code, m.name, m.unit,
         sum(l.qty)::numeric as required_qty,
         (array_agg(l.preco order by l.counter, l.fonte))[1] as unit_price
  from linhas l
  join materials m on m.id = l.material_id
  group by l.material_id, m.code, m.name, m.unit;
$$;

-- Substitui o "carrega o BOM inteiro para responder sim ou não" que rodava a
-- cada save de vínculo manual em assertMaterialInBudgetScope.
create or replace function public.is_material_in_budget(p_budget_id uuid, p_material_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from budget_posts bp
    join post_item_groups pig on pig.budget_post_id = bp.id
    join post_item_group_materials pigm on pigm.post_item_group_id = pig.id
    where bp.budget_id = p_budget_id and pigm.material_id = p_material_id
  ) or exists (
    select 1
    from budget_posts bp
    join post_materials pm on pm.post_id = bp.id
    where bp.budget_id = p_budget_id and pm.material_id = p_material_id
  );
$$;

-- security invoker de propósito: a RLS de budget_posts / materials continua
-- valendo, ninguém enxerga orçamento de outra organização por dentro da função.
grant execute on function public.budget_consolidated_materials(uuid) to authenticated;
grant execute on function public.is_material_in_budget(uuid, uuid) to authenticated;

-- O planner vinha caindo em Seq Scan em post_materials apesar do índice por
-- post_id existir: estatística velha.
analyze post_materials;
analyze post_item_group_materials;


-- =============================================================================
-- PARTE: 20260908121000_supplies_items_org_rls
-- =============================================================================

-- =============================================================================
-- ORG_ID EM supplier_quote_items E semantic_match_suggestions
--
-- Continuação direta de `20260812140000_org_id_canvas_children.sql`, que fez a
-- mesma cirurgia nas tabelas-filhas do canvas. Estas duas ficaram para trás: são
-- as únicas do módulo de Suprimentos que nunca ganharam org_id.
--
-- O DEFEITO DE PERFORMANCE
--   supplier_quote_items_select:
--     EXISTS (SELECT 1 FROM supplier_quotes sq
--             WHERE sq.id = supplier_quote_items.quote_id AND sq.user_id = auth.uid())
--   semantic_match_suggestions_select, pior, junta duas tabelas por linha.
--
--   Duas doenças na mesma policy: subconsulta correlacionada reavaliada por
--   linha (em cima de 3.922 itens, que a Conciliação lê inteiros), e `auth.uid()`
--   fora de `(SELECT ...)`, o que impede o Postgres de transformá-la num
--   InitPlan único e a faz rodar uma vez por linha também.
--
-- O DEFEITO DE ESCOPO QUE VEM JUNTO
--   O predicado efetivo é `user_id = auth.uid()` NA COTAÇÃO, enquanto
--   supplier_quotes já filtra por `org_id = current_org_id()`. Ou seja: um
--   colega da mesma organização enxerga a cotação na lista e NÃO enxerga os
--   itens dela, nem as sugestões da IA. A tela mostra uma cotação vazia. Isto é
--   resto da era pré-organização, não uma decisão de isolamento por pessoa.
--
-- SEM MUDANÇA DE CÓDIGO NA APLICAÇÃO: org_id é derivado do pai por trigger,
-- então todo INSERT existente continua funcionando sem passar a coluna.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Coluna
-- -----------------------------------------------------------------------------
ALTER TABLE public.supplier_quote_items
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.semantic_match_suggestions
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

COMMENT ON COLUMN public.supplier_quote_items.org_id IS
  'Organização dona, desnormalizada de supplier_quotes. Existe para que a policy '
  'de RLS seja uma comparação direta em vez de um EXISTS reavaliado por linha. '
  'Preenchida por trigger, a aplicação não precisa enviá-la.';

-- -----------------------------------------------------------------------------
-- 2. Backfill, de cima para baixo
-- -----------------------------------------------------------------------------
UPDATE public.supplier_quote_items sqi
   SET org_id = sq.org_id
  FROM public.supplier_quotes sq
 WHERE sq.id = sqi.quote_id
   AND sqi.org_id IS DISTINCT FROM sq.org_id;

UPDATE public.semantic_match_suggestions sms
   SET org_id = sqi.org_id
  FROM public.supplier_quote_items sqi
 WHERE sqi.id = sms.supplier_quote_item_id
   AND sms.org_id IS DISTINCT FROM sqi.org_id;

-- -----------------------------------------------------------------------------
-- 3. Portão de integridade: órfã com org_id NULL ficaria invisível para todos
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_orfas RECORD;
BEGIN
  FOR v_orfas IN
    SELECT 'supplier_quote_items' AS t, count(*) AS n
      FROM public.supplier_quote_items WHERE org_id IS NULL
    UNION ALL
    SELECT 'semantic_match_suggestions', count(*)
      FROM public.semantic_match_suggestions WHERE org_id IS NULL
  LOOP
    IF v_orfas.n > 0 THEN
      RAISE EXCEPTION
        'Migration abortada: % linha(s) órfã(s) em public.% ficariam sem org_id e invisíveis. Investigue os registros sem pai antes de aplicar.',
        v_orfas.n, v_orfas.t;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.supplier_quote_items       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.semantic_match_suggestions ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_quote_items_org
  ON public.supplier_quote_items (org_id);
CREATE INDEX IF NOT EXISTS idx_semantic_match_suggestions_org
  ON public.semantic_match_suggestions (org_id);

-- -----------------------------------------------------------------------------
-- 4. Triggers que derivam org_id do pai
--
--    SECURITY DEFINER: a consulta ao pai não deve disparar a RLS do pai, que é
--    exatamente o aninhamento que estamos eliminando.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supplier_quote_items_set_org_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT sq.org_id INTO NEW.org_id
    FROM public.supplier_quotes sq WHERE sq.id = NEW.quote_id;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'Cotação % não encontrada ou sem organização.', NEW.quote_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.supplier_quote_items_set_org_id() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.semantic_match_suggestions_set_org_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT sqi.org_id INTO NEW.org_id
    FROM public.supplier_quote_items sqi WHERE sqi.id = NEW.supplier_quote_item_id;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'Item de cotação % não encontrado ou sem organização.', NEW.supplier_quote_item_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.semantic_match_suggestions_set_org_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_supplier_quote_items_set_org_id ON public.supplier_quote_items;
CREATE TRIGGER trg_supplier_quote_items_set_org_id
  BEFORE INSERT OR UPDATE OF quote_id ON public.supplier_quote_items
  FOR EACH ROW EXECUTE FUNCTION public.supplier_quote_items_set_org_id();

DROP TRIGGER IF EXISTS trg_semantic_match_suggestions_set_org_id ON public.semantic_match_suggestions;
CREATE TRIGGER trg_semantic_match_suggestions_set_org_id
  BEFORE INSERT OR UPDATE OF supplier_quote_item_id ON public.semantic_match_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.semantic_match_suggestions_set_org_id();

-- -----------------------------------------------------------------------------
-- 5. Policies
--
--    `TO authenticated` sempre, nunca public/anon.
--    A DELETE de semantic_match_suggestions não existia: sem ela, apagar um PDF
--    em cascata deixava as sugestões para trás.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS supplier_quote_items_select ON public.supplier_quote_items;
DROP POLICY IF EXISTS supplier_quote_items_insert ON public.supplier_quote_items;
DROP POLICY IF EXISTS supplier_quote_items_update ON public.supplier_quote_items;
DROP POLICY IF EXISTS supplier_quote_items_delete ON public.supplier_quote_items;

CREATE POLICY supplier_quote_items_select ON public.supplier_quote_items
  FOR SELECT TO authenticated USING (org_id = (SELECT public.current_org_id()));
CREATE POLICY supplier_quote_items_insert ON public.supplier_quote_items
  FOR INSERT TO authenticated WITH CHECK (org_id = (SELECT public.current_org_id()));
CREATE POLICY supplier_quote_items_update ON public.supplier_quote_items
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT public.current_org_id()))
  WITH CHECK (org_id = (SELECT public.current_org_id()));
CREATE POLICY supplier_quote_items_delete ON public.supplier_quote_items
  FOR DELETE TO authenticated USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS semantic_match_suggestions_select ON public.semantic_match_suggestions;
DROP POLICY IF EXISTS semantic_match_suggestions_insert ON public.semantic_match_suggestions;
DROP POLICY IF EXISTS semantic_match_suggestions_update ON public.semantic_match_suggestions;
DROP POLICY IF EXISTS semantic_match_suggestions_delete ON public.semantic_match_suggestions;

CREATE POLICY semantic_match_suggestions_select ON public.semantic_match_suggestions
  FOR SELECT TO authenticated USING (org_id = (SELECT public.current_org_id()));
CREATE POLICY semantic_match_suggestions_insert ON public.semantic_match_suggestions
  FOR INSERT TO authenticated WITH CHECK (org_id = (SELECT public.current_org_id()));
CREATE POLICY semantic_match_suggestions_update ON public.semantic_match_suggestions
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT public.current_org_id()))
  WITH CHECK (org_id = (SELECT public.current_org_id()));
CREATE POLICY semantic_match_suggestions_delete ON public.semantic_match_suggestions
  FOR DELETE TO authenticated USING (org_id = (SELECT public.current_org_id()));


-- =============================================================================
-- PARTE: 20260908122000_supplies_items_fk_indexes
-- =============================================================================

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


-- =============================================================================
-- REGISTRO NO HISTÓRICO DE MIGRATIONS
--
-- Rodando pelo SQL Editor, o CLI não fica sabendo. Sem estas linhas, um
-- `supabase db push` futuro tentaria aplicar tudo de novo (o que é inofensivo,
-- porque o script é idempotente, mas polui). Marca as três como já aplicadas.
-- =============================================================================
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES
  ('20260908120000', 'supplies_budget_bom_functions'),
  ('20260908121000', 'supplies_items_org_rls'),
  ('20260908122000', 'supplies_items_fk_indexes')
ON CONFLICT (version) DO NOTHING;


-- =============================================================================
-- CONFERÊNCIAS, para rodar DEPOIS, numa execução separada
-- =============================================================================
--
-- 1. Ninguém ficou sem org_id (tem que voltar 0 nas duas).
--
-- select
--   (select count(*) from supplier_quote_items where org_id is null) itens_sem_org,
--   (select count(*) from semantic_match_suggestions where org_id is null) sugestoes_sem_org;
--
-- 2. As policies novas estão no lugar (as 8 devem comparar org_id com
--    current_org_id(), sem nenhum EXISTS).
--
-- select tablename, policyname, cmd, qual
--   from pg_policies
--  where tablename in ('supplier_quote_items','semantic_match_suggestions')
--  order by tablename, cmd;
--
-- 3. As funções respondem. Troque <budget_id> por um orçamento real com postes.
--
-- select count(*) materiais, round(sum(required_qty)) qtd_total
--   from budget_consolidated_materials('<budget_id>');
--
-- 4. E na tela: abrir a Conciliação de uma sessão que tenha cotações e conferir
--    que os itens aparecem. É o teste que vale.
