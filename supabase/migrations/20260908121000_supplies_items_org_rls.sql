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
