-- =============================================================================
-- Resolve os 125 pares (sessão, material) que a Fase 1 deixou de fora
--
-- CONTEXTO (MD/PLANO-DRE-OBRA.md §5.4.1)
--   152 linhas de scenario_purchase_orders, 5 números de OC. 27 foram
--   resolvidas sem ambiguidade (seleção no Cenário Ideal, ou candidato
--   único). As outras 125 ficaram de fora: fornecedor ambíguo entre
--   múltiplas cotações, sem seleção ideal para desempatar.
--
--   Decisão de negócio do Paulo: resolver automaticamente em vez de refazer
--   a escolha manualmente nas 3 sessões afetadas. Cada OC recebe tratamento
--   proporcional à confiança que o dado já tem:
--
--   OC 596, 619, 625 — JÁ TÊM fornecedor confirmado nesta mesma OC (veio de
--   uma escolha real no Cenário Ideal, não de heurística). Estender esse
--   MESMO fornecedor para o resto da OC não é um chute: uma ordem de compra
--   é, na prática, sempre de um fornecedor só — o forte é assumir que quem
--   já se confirmou vencedor de parte da OC venceu o resto dela também.
--   Confirmado no dado: o fornecedor já confirmado cobre 100% (596, 625) ou
--   91% (619 — 30 de 33; os outros 3 materiais não têm cotação de ninguém,
--   ver "materiais sem preço algum" abaixo) do que faltava.
--
--   OC 595 — NÃO tem nenhum fornecedor confirmado nesta sessão (nunca passou
--   por seleção ideal nem parcialmente). Aqui sim é estimativa: vence quem
--   cobre mais materiais do grupo, desempate por menor total. Resultado:
--   CELESP, 41/41 materiais, o candidato mais barato entre os 3 concorrentes
--   plausíveis. O cabeçalho nasce com `notes` avisando que é estimado — não
--   existe uma segunda fonte pra confirmar isso.
--
--   4 materiais (CINTA CIRCULAR 250MM, CONECTOR PARAFUSO FENDIDO 50MM²,
--   OLHAL PARAFUSO 50KN ×2) não têm cotação de NENHUM fornecedor na sessão —
--   não é ambiguidade, é ausência total de preço. Ficam de fora mesmo,
--   reportados via WARNING; não há como inventar um preço do nada.
-- =============================================================================

DO $do$
DECLARE
  v_596 INT := 0;
  v_619 INT := 0;
  v_625 INT := 0;
  v_595_header UUID;
  v_595_itens INT := 0;
  v_595_session UUID;
  v_595_org UUID;
  v_595_budget UUID;
  v_595_supplier TEXT;
  v_sem_preco INT;
BEGIN
  IF to_regclass('public.scenario_purchase_orders') IS NULL THEN
    RAISE NOTICE 'scenario_purchase_orders ausente — nada a resolver.';
    RETURN;
  END IF;

  -- ---------------------------------------------------------------------------
  -- OC 596 — estende ELECTRASUL (já confirmado) para o resto do grupo
  -- ---------------------------------------------------------------------------
  WITH alvo AS (
    SELECT po.id AS purchase_order_id, po.session_id, po.supplier_name
    FROM public.purchase_orders po
    WHERE po.oc_number = '596'
  ),
  pendentes AS (
    SELECT DISTINCT spo.session_id, spo.material_id
    FROM public.scenario_purchase_orders spo
    WHERE btrim(spo.oc_number) = '596'
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_order_items poi
        JOIN public.purchase_orders po2 ON po2.id = poi.purchase_order_id
        WHERE po2.session_id = spo.session_id AND poi.material_id = spo.material_id
      )
  ),
  resolvido AS (
    SELECT a.purchase_order_id, p.material_id,
           sqi.quantidade,
           COALESCE(sqi.preco_negociado, sqi.preco_unit, 0) AS preco_unit
    FROM pendentes p
    JOIN alvo a ON a.session_id = p.session_id
    JOIN public.supplier_quotes sq ON sq.session_id = p.session_id AND sq.supplier_name = a.supplier_name
    JOIN public.supplier_quote_items sqi
      ON sqi.quote_id = sq.id AND sqi.matched_material_id = p.material_id AND sqi.quantidade > 0
  ),
  ins AS (
    INSERT INTO public.purchase_order_items (purchase_order_id, material_id, quantidade, preco_unit)
    SELECT purchase_order_id, material_id, quantidade, preco_unit FROM resolvido
    ON CONFLICT (purchase_order_id, material_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_596 FROM ins;

  -- ---------------------------------------------------------------------------
  -- OC 619 — estende ELECTRASUL (único candidato + já confirmado nesta OC)
  -- ---------------------------------------------------------------------------
  WITH alvo AS (
    SELECT po.id AS purchase_order_id, po.session_id, po.supplier_name
    FROM public.purchase_orders po
    WHERE po.oc_number = '619'
  ),
  pendentes AS (
    SELECT DISTINCT spo.session_id, spo.material_id
    FROM public.scenario_purchase_orders spo
    WHERE btrim(spo.oc_number) = '619'
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_order_items poi
        JOIN public.purchase_orders po2 ON po2.id = poi.purchase_order_id
        WHERE po2.session_id = spo.session_id AND poi.material_id = spo.material_id
      )
  ),
  resolvido AS (
    SELECT a.purchase_order_id, p.material_id,
           sqi.quantidade,
           COALESCE(sqi.preco_negociado, sqi.preco_unit, 0) AS preco_unit
    FROM pendentes p
    JOIN alvo a ON a.session_id = p.session_id
    JOIN public.supplier_quotes sq ON sq.session_id = p.session_id AND sq.supplier_name = a.supplier_name
    JOIN public.supplier_quote_items sqi
      ON sqi.quote_id = sq.id AND sqi.matched_material_id = p.material_id AND sqi.quantidade > 0
  ),
  ins AS (
    INSERT INTO public.purchase_order_items (purchase_order_id, material_id, quantidade, preco_unit)
    SELECT purchase_order_id, material_id, quantidade, preco_unit FROM resolvido
    ON CONFLICT (purchase_order_id, material_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_619 FROM ins;

  -- ---------------------------------------------------------------------------
  -- OC 625 — estende ELECTRASUL (único candidato + já confirmado nesta OC)
  -- ---------------------------------------------------------------------------
  WITH alvo AS (
    SELECT po.id AS purchase_order_id, po.session_id, po.supplier_name
    FROM public.purchase_orders po
    WHERE po.oc_number = '625'
  ),
  pendentes AS (
    SELECT DISTINCT spo.session_id, spo.material_id
    FROM public.scenario_purchase_orders spo
    WHERE btrim(spo.oc_number) = '625'
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_order_items poi
        JOIN public.purchase_orders po2 ON po2.id = poi.purchase_order_id
        WHERE po2.session_id = spo.session_id AND poi.material_id = spo.material_id
      )
  ),
  resolvido AS (
    SELECT a.purchase_order_id, p.material_id,
           sqi.quantidade,
           COALESCE(sqi.preco_negociado, sqi.preco_unit, 0) AS preco_unit
    FROM pendentes p
    JOIN alvo a ON a.session_id = p.session_id
    JOIN public.supplier_quotes sq ON sq.session_id = p.session_id AND sq.supplier_name = a.supplier_name
    JOIN public.supplier_quote_items sqi
      ON sqi.quote_id = sq.id AND sqi.matched_material_id = p.material_id AND sqi.quantidade > 0
  ),
  ins AS (
    INSERT INTO public.purchase_order_items (purchase_order_id, material_id, quantidade, preco_unit)
    SELECT purchase_order_id, material_id, quantidade, preco_unit FROM resolvido
    ON CONFLICT (purchase_order_id, material_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_625 FROM ins;

  -- ---------------------------------------------------------------------------
  -- OC 595 — SEM âncora confirmada. Estimativa: maior cobertura, desempate
  -- por menor total. Cabeçalho novo, marcado como estimado em `notes`.
  --
  -- Calcula o vencedor UMA VEZ em variáveis (v_595_*) e reaproveita: CTEs não
  -- atravessam statements dentro de um bloco PL/pgSQL, então repetir a mesma
  -- WITH em cada INSERT recalcularia (e poderia divergir) em vez de reusar.
  -- ---------------------------------------------------------------------------
  SELECT p.session_id, p.org_id, p.budget_id
    INTO v_595_session, v_595_org, v_595_budget
  FROM (
    SELECT DISTINCT spo.session_id, qs.org_id, qs.budget_id
    FROM public.scenario_purchase_orders spo
    JOIN public.quotation_sessions qs ON qs.id = spo.session_id
    WHERE btrim(spo.oc_number) = '595'
  ) p
  LIMIT 1;

  IF v_595_session IS NOT NULL THEN
    SELECT sq.supplier_name INTO v_595_supplier
    FROM (
      SELECT DISTINCT spo.material_id
      FROM public.scenario_purchase_orders spo
      WHERE btrim(spo.oc_number) = '595'
    ) p
    JOIN public.supplier_quotes sq ON sq.session_id = v_595_session
    JOIN public.supplier_quote_items sqi
      ON sqi.quote_id = sq.id AND sqi.matched_material_id = p.material_id AND sqi.quantidade > 0
    GROUP BY sq.supplier_name
    ORDER BY count(DISTINCT p.material_id) DESC,
             sum(COALESCE(sqi.preco_negociado, sqi.preco_unit, 0) * sqi.quantidade) ASC
    LIMIT 1;
  END IF;

  IF v_595_supplier IS NOT NULL THEN
    SELECT po.id INTO v_595_header
    FROM public.purchase_orders po
    WHERE po.session_id = v_595_session AND po.oc_number = '595';

    IF v_595_header IS NULL THEN
      INSERT INTO public.purchase_orders
        (org_id, budget_id, session_id, oc_number, supplier_name, freight_value, delivery_date, status, user_id, notes)
      VALUES (
        v_595_org, v_595_budget, v_595_session, '595', v_595_supplier,
        NULL, NULL, 'emitida',
        (SELECT user_id FROM public.scenario_purchase_orders WHERE session_id = v_595_session LIMIT 1),
        'Fornecedor estimado automaticamente (maior cobertura de materiais entre cotações concorrentes, '
        || 'desempate por menor total) — esta OC nunca passou por seleção no Cenário Ideal, não há confirmação '
        || 'real de qual fornecedor venceu. Ver MD/PLANO-DRE-OBRA.md §5.4.1.'
      )
      RETURNING id INTO v_595_header;
    END IF;

    WITH resolvido AS (
      SELECT v_595_header AS purchase_order_id, spo.material_id, sqi.quantidade,
             COALESCE(sqi.preco_negociado, sqi.preco_unit, 0) AS preco_unit
      FROM (SELECT DISTINCT material_id FROM public.scenario_purchase_orders WHERE btrim(oc_number) = '595') spo
      JOIN public.supplier_quotes sq ON sq.session_id = v_595_session AND sq.supplier_name = v_595_supplier
      JOIN public.supplier_quote_items sqi
        ON sqi.quote_id = sq.id AND sqi.matched_material_id = spo.material_id AND sqi.quantidade > 0
    ),
    ins AS (
      INSERT INTO public.purchase_order_items (purchase_order_id, material_id, quantidade, preco_unit)
      SELECT purchase_order_id, material_id, quantidade, preco_unit FROM resolvido
      ON CONFLICT (purchase_order_id, material_id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_595_itens FROM ins;
  END IF;

  RAISE NOTICE 'Resolvidos: OC 596 → % itens, OC 619 → % itens, OC 625 → % itens, OC 595 (estimado) → % itens',
    v_596, v_619, v_625, v_595_itens;

  -- ---------------------------------------------------------------------------
  -- O que continua sem preço em lugar nenhum — não inventado, só reportado.
  -- ---------------------------------------------------------------------------
  SELECT count(DISTINCT (spo.session_id, spo.material_id)) INTO v_sem_preco
  FROM public.scenario_purchase_orders spo
  WHERE length(btrim(spo.oc_number)) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.purchase_order_items poi
      JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
      WHERE po.session_id = spo.session_id AND poi.material_id = spo.material_id
    );

  IF v_sem_preco > 0 THEN
    RAISE WARNING '% (sessão, material) seguem sem OC migrada — nenhum fornecedor cotou esse material nessa '
                  'sessão com quantidade válida. Não é ambiguidade, é ausência total de preço; não há como inferir.',
      v_sem_preco;
  END IF;
END
$do$;
