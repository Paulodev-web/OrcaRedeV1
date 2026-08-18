-- =============================================================================
-- purchase_orders — a OC deixa de ser etiqueta e vira documento
--
-- O QUE EXISTE HOJE
--   `scenario_purchase_orders` (20260701000000) é (session_id, material_id,
--   oc_number): uma ETIQUETA DE TEXTO por material. Sem valor, sem fornecedor,
--   sem frete, sem data de entrega, sem status. Não dá para somar "Custo
--   Executado" a partir disso.
--
-- ÂNCORA: budget_id, NÃO dre_id
--   A OC nasce durante a compra; a DRE só abre depois que a obra fecha. Pendurar
--   a OC na DRE tornaria impossível emitir OC antes de existir DRE — que é a
--   ordem real dos fatos. A DRE agrega as OCs pelo `budget_id`.
--
-- budget_id É NULO DE PROPÓSITO
--   `quotation_sessions.budget_id` é NULL (sessão global, 20260407120000). OC
--   de sessão global não pertence a obra nenhuma e simplesmente não entra em
--   DRE alguma até alguém amarrá-la a um orçamento.
--
--   ⚠ Ordem: depois de 20260818121000_dre_core.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Cabeçalho
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL DEFAULT public.current_org_id()
                            REFERENCES public.organizations(id) ON DELETE RESTRICT,
  budget_id     UUID        NULL REFERENCES public.budgets(id) ON DELETE SET NULL,
  session_id    UUID        NULL REFERENCES public.quotation_sessions(id) ON DELETE SET NULL,
  supplier_id   UUID        NULL REFERENCES public.suppliers(id) ON DELETE SET NULL,

  oc_number     TEXT        NOT NULL CHECK (length(btrim(oc_number)) > 0),

  -- Denormalizado de propósito: renomear ou apagar o fornecedor no cadastro não
  -- pode reescrever uma OC já emitida. Mesmo princípio de
  -- proposal_pricing_options guardar os totais congelados.
  supplier_name TEXT        NOT NULL CHECK (length(btrim(supplier_name)) > 0),

  -- Mantido por trigger a partir dos itens: a tela da DRE lista dezenas de OCs
  -- e não pode agregar filhas a cada render.
  items_value   NUMERIC     NOT NULL DEFAULT 0 CHECK (items_value >= 0),

  -- NULL ≠ 0. NULL é "frete não informado" (todas as OCs migradas do modelo
  -- antigo, que não tinha o campo); 0 é "esta compra não teve frete". A DRE
  -- soma NULL como zero MAS avisa em quantas OCs o frete está em branco —
  -- senão o grupo `frete` mostra R$ 0,00 e ninguém desconfia.
  freight_value NUMERIC     NULL CHECK (freight_value IS NULL OR freight_value >= 0),

  delivery_date DATE        NULL,
  status        TEXT        NOT NULL DEFAULT 'emitida'
                            CHECK (status IN ('emitida', 'entregue', 'cancelada')),
  notes         TEXT        NULL,

  user_id       UUID        NOT NULL DEFAULT auth.uid()
                            REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT purchase_orders_org_number_unq UNIQUE (org_id, oc_number)
);

COMMENT ON TABLE public.purchase_orders IS
  'Ordem de compra como documento. Substitui scenario_purchase_orders, que era '
  'só o número da OC etiquetado por material.';

COMMENT ON COLUMN public.purchase_orders.freight_value IS
  'NULL = não informado (inclui tudo que veio da migração). 0 = sem frete.';

COMMENT ON COLUMN public.purchase_orders.status IS
  'OC cancelada NÃO entra no realizado da DRE.';

CREATE INDEX IF NOT EXISTS idx_purchase_orders_budget  ON public.purchase_orders (budget_id)
  WHERE budget_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_session ON public.purchase_orders (session_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org     ON public.purchase_orders (org_id);

CREATE OR REPLACE FUNCTION public.update_purchase_orders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_purchase_orders_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Itens
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID        NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  material_id       UUID        NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  quantidade        NUMERIC     NOT NULL CHECK (quantidade > 0),
  preco_unit        NUMERIC     NOT NULL CHECK (preco_unit >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_items_oc_material_unq UNIQUE (purchase_order_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_oc
  ON public.purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_material
  ON public.purchase_order_items (material_id);

-- -----------------------------------------------------------------------------
-- 3. items_value mantido pelo banco
--
--    No banco e não na aplicação porque existem três caminhos de escrita
--    (tela de OC, importação de cotação, migração) e um deles esquecer de
--    recalcular produziria uma DRE errada sem erro nenhum aparecendo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_orders_recalc_items_value()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_oc UUID := COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
BEGIN
  UPDATE public.purchase_orders o
     SET items_value = COALESCE((
           SELECT sum(i.quantidade * i.preco_unit)
           FROM public.purchase_order_items i
           WHERE i.purchase_order_id = v_oc
         ), 0)
   WHERE o.id = v_oc;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_purchase_order_items_recalc ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_orders_recalc_items_value();

-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_orders_select" ON public.purchase_orders;
CREATE POLICY "purchase_orders_select" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "purchase_orders_insert" ON public.purchase_orders;
CREATE POLICY "purchase_orders_insert" ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (SELECT public.current_org_id())
    AND auth.uid() = user_id
  );

DROP POLICY IF EXISTS "purchase_orders_update" ON public.purchase_orders;
CREATE POLICY "purchase_orders_update" ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING      (org_id = (SELECT public.current_org_id()))
  WITH CHECK (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "purchase_orders_delete" ON public.purchase_orders;
CREATE POLICY "purchase_orders_delete" ON public.purchase_orders
  FOR DELETE TO authenticated
  USING (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "purchase_order_items_all" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_all" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders o
      WHERE o.id = purchase_order_items.purchase_order_id
        AND o.org_id = (SELECT public.current_org_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders o
      WHERE o.id = purchase_order_items.purchase_order_id
        AND o.org_id = (SELECT public.current_org_id())
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Migração de scenario_purchase_orders
--
--    Cada (sessão, nº de OC, fornecedor) vira um cabeçalho; os materiais viram
--    itens. Valor e quantidade vêm pela cadeia que já existe:
--
--      scenario_purchase_orders → scenario_ideal_selections (fornecedor escolhido)
--                               → supplier_quote_items (matched_material_id)
--
--    O que NÃO tem de onde vir, e entra em branco:
--      • freight_value  → NULL  (o campo não existia no schema; ver §1)
--      • delivery_date  → NULL
--
--    O agrupamento inclui o fornecedor porque, no modelo antigo, nada impedia
--    dois materiais com o mesmo oc_number apontarem para cotações de empresas
--    diferentes. Se isso existir no dado, viram duas OCs — o que está certo:
--    uma OC é sempre de um fornecedor só. O UNIQUE (org_id, oc_number) reclamaria
--    nesse caso, então o número recebe sufixo do fornecedor.
--
--    Idempotente: pula OC cujo número já exista na org.
-- -----------------------------------------------------------------------------
DO $do$
DECLARE
  v_ocs   INT := 0;
  v_itens INT := 0;
BEGIN
  IF to_regclass('public.scenario_purchase_orders') IS NULL THEN
    RAISE NOTICE 'scenario_purchase_orders ausente — nada a migrar.';
    RETURN;
  END IF;

  WITH origem AS (
    SELECT
      spo.session_id,
      btrim(spo.oc_number)                                   AS oc_number,
      spo.material_id,
      spo.user_id,
      spo.org_id,
      qs.budget_id,
      sq.supplier_name,
      sq.id                                                  AS quote_id,
      COALESCE(sqi.preco_negociado, sqi.preco_unit, 0)       AS preco_unit,
      NULLIF(sqi.quantidade, 0)                              AS quantidade
    FROM public.scenario_purchase_orders spo
    JOIN public.quotation_sessions qs
      ON qs.id = spo.session_id
    JOIN public.scenario_ideal_selections sis
      ON  sis.session_id  = spo.session_id
      AND sis.material_id = spo.material_id
      AND sis.user_id     = spo.user_id
    JOIN public.supplier_quotes sq
      ON sq.id = sis.quote_id
    LEFT JOIN public.supplier_quote_items sqi
      ON  sqi.quote_id            = sis.quote_id
      AND sqi.matched_material_id = spo.material_id
    WHERE length(btrim(spo.oc_number)) > 0
  ),
  cabecalhos AS (
    SELECT DISTINCT ON (session_id, oc_number, supplier_name)
      session_id, oc_number, supplier_name, org_id, budget_id, user_id
    FROM origem
    ORDER BY session_id, oc_number, supplier_name
  ),
  numerados AS (
    SELECT
      c.*,
      CASE
        WHEN count(*) OVER (PARTITION BY c.org_id, c.oc_number) > 1
          THEN c.oc_number || ' — ' || c.supplier_name
        ELSE c.oc_number
      END AS oc_number_final
    FROM cabecalhos c
  ),
  inseridos AS (
    INSERT INTO public.purchase_orders
      (org_id, budget_id, session_id, oc_number, supplier_name,
       freight_value, delivery_date, status, user_id)
    SELECT
      n.org_id, n.budget_id, n.session_id, n.oc_number_final, n.supplier_name,
      NULL, NULL, 'emitida', n.user_id
    FROM numerados n
    WHERE NOT EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.org_id = n.org_id AND po.oc_number = n.oc_number_final
    )
    RETURNING id, session_id, oc_number, supplier_name
  )
  SELECT count(*) INTO v_ocs FROM inseridos;

  -- Itens numa segunda passada: a CTE de INSERT acima já consumiu `origem`,
  -- e reaproveitar RETURNING junto com uma nova leitura da mesma tabela dentro
  -- de um único statement é onde este tipo de migração costuma silenciar linhas.
  WITH origem AS (
    SELECT
      spo.session_id,
      btrim(spo.oc_number)                             AS oc_number,
      spo.material_id,
      sq.supplier_name,
      COALESCE(sqi.preco_negociado, sqi.preco_unit, 0) AS preco_unit,
      NULLIF(sqi.quantidade, 0)                        AS quantidade
    FROM public.scenario_purchase_orders spo
    JOIN public.scenario_ideal_selections sis
      ON  sis.session_id  = spo.session_id
      AND sis.material_id = spo.material_id
      AND sis.user_id     = spo.user_id
    JOIN public.supplier_quotes sq
      ON sq.id = sis.quote_id
    LEFT JOIN public.supplier_quote_items sqi
      ON  sqi.quote_id            = sis.quote_id
      AND sqi.matched_material_id = spo.material_id
    WHERE length(btrim(spo.oc_number)) > 0
  ),
  pareado AS (
    SELECT DISTINCT ON (po.id, o.material_id)
      po.id AS purchase_order_id,
      o.material_id,
      o.quantidade,
      o.preco_unit
    FROM origem o
    JOIN public.purchase_orders po
      ON  po.session_id    = o.session_id
      AND po.supplier_name = o.supplier_name
      AND (po.oc_number = o.oc_number
           OR po.oc_number = o.oc_number || ' — ' || o.supplier_name)
    WHERE o.quantidade IS NOT NULL
    ORDER BY po.id, o.material_id, o.preco_unit DESC
  ),
  ins AS (
    INSERT INTO public.purchase_order_items
      (purchase_order_id, material_id, quantidade, preco_unit)
    SELECT purchase_order_id, material_id, quantidade, preco_unit
    FROM pareado
    ON CONFLICT (purchase_order_id, material_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_itens FROM ins;

  RAISE NOTICE 'Migração de OC: % cabeçalhos, % itens.', v_ocs, v_itens;

  -- Material sem quantidade na cotação não vira item (a OC fica com valor
  -- menor que o real). Vale saber quantos são antes de confiar no número.
  IF EXISTS (
    SELECT 1 FROM public.scenario_purchase_orders spo
    JOIN public.scenario_ideal_selections sis
      ON sis.session_id = spo.session_id AND sis.material_id = spo.material_id
    LEFT JOIN public.supplier_quote_items sqi
      ON sqi.quote_id = sis.quote_id AND sqi.matched_material_id = spo.material_id
    WHERE sqi.id IS NULL OR COALESCE(sqi.quantidade, 0) = 0
  ) THEN
    RAISE WARNING 'Há OCs cujo material não tem item de cotação com quantidade. '
                  'Essas OCs nascem com items_value abaixo do real e precisam de '
                  'conferência manual.';
  END IF;
END
$do$;

COMMENT ON TABLE public.scenario_purchase_orders IS
  'DEPRECADA. Substituída por purchase_orders/purchase_order_items '
  '(20260818122000). Mantida só para leitura durante a transição; removida na '
  'Fase 4 do MD/PLANO-DRE-OBRA.md.';
