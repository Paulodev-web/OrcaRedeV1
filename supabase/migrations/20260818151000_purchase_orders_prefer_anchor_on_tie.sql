-- =============================================================================
-- Corrige a regra de conflito da 20260818150000 — âncora deve vencer empate
-- de cobertura, não ser descartada por ele
--
-- ACHADO EM PRODUÇÃO (ao aplicar 20260818150000)
--   OC "596" (sessão 205_EVANDRO CASANOVA) tinha 9 materiais pendentes.
--   ELECTRASUL e Schimanko empatavam em cobertura (9 de 9 cada); o desempate
--   por menor total escolheu Schimanko (R$15.322,86 < R$30.106,77 do
--   ELECTRASUL). Mas ELECTRASUL já era o fornecedor CONFIRMADO da OC (1
--   material com seleção real no Cenário Ideal) — a 20260818150000 tratou
--   esse descompasso como "conflito genuíno" e recusou resolver, quando na
--   verdade é exatamente o caso em que a âncora deveria desempatar: a mesma
--   OC não muda de fornecedor porque um concorrente cotou mais barato pro
--   resto do lote.
--
--   A regra ficou boa demais pro seu próprio bem — tratou "empate de
--   cobertura com preço diferente" igual a "fornecedor completamente
--   diferente vencendo por larga margem", que são situações de confiança
--   bem diferentes.
--
-- A CORREÇÃO
--   Quando existe conflito (âncora ≠ vencedor por preço), verifica se a
--   âncora está EMPATADA na cobertura máxima. Se sim, a âncora vence — é
--   exatamente o caso "mesma OC, mesmo fornecedor, resto do lote". Só fica
--   como conflito de verdade (sem resolver, WARNING) quando a âncora cobre
--   MENOS materiais que o líder — aí sim são fornecedores genuinamente
--   diferentes disputando o grupo.
--
--   Auditado antes de escrever: só a OC 596 tinha esse padrão nos dados
--   atuais (619, 625 e FATURAMENTO DIRETO — os outros grupos que sobraram —
--   são lacuna genuína, zero candidato, confirmado por consulta antes desta
--   migration).
-- =============================================================================

DO $do$
DECLARE
  grp RECORD;
  v_anchor_supplier TEXT;
  v_max_cobertura   INT;
  v_anchor_cobertura INT;
  v_header_id       UUID;
  v_org_id          UUID;
  v_budget_id       UUID;
  v_user_id         UUID;
  v_n INT;
  v_grupos_corrigidos INT := 0;
  v_itens_inseridos   INT := 0;
BEGIN
  IF to_regclass('public.scenario_purchase_orders') IS NULL THEN
    RETURN;
  END IF;

  FOR grp IN
    SELECT DISTINCT spo.session_id, btrim(spo.oc_number) AS oc_number
    FROM public.scenario_purchase_orders spo
    WHERE length(btrim(spo.oc_number)) > 0
      AND EXISTS (
        SELECT 1
        FROM public.scenario_purchase_orders spo2
        WHERE spo2.session_id = spo.session_id AND btrim(spo2.oc_number) = btrim(spo.oc_number)
          AND NOT EXISTS (
            SELECT 1 FROM public.purchase_order_items poi
            JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
            WHERE po.session_id = spo2.session_id AND poi.material_id = spo2.material_id
          )
      )
  LOOP
    -- Só se aplica a grupo com âncora — sem âncora não há "empate a favor de
    -- ninguém em especial" para resolver aqui.
    SELECT sq.supplier_name
      INTO v_anchor_supplier
    FROM public.scenario_ideal_selections sis
    JOIN public.scenario_purchase_orders spo
      ON spo.session_id = sis.session_id AND spo.material_id = sis.material_id AND spo.user_id = sis.user_id
    JOIN public.supplier_quotes sq ON sq.id = sis.quote_id
    WHERE sis.session_id = grp.session_id AND btrim(spo.oc_number) = grp.oc_number
    LIMIT 1;

    IF v_anchor_supplier IS NULL THEN
      CONTINUE;
    END IF;

    -- Cobertura máxima entre todos os candidatos, e cobertura da âncora,
    -- entre os materiais AINDA pendentes deste grupo.
    WITH pend AS (
      SELECT DISTINCT spo.material_id
      FROM public.scenario_purchase_orders spo
      WHERE spo.session_id = grp.session_id AND btrim(spo.oc_number) = grp.oc_number
        AND NOT EXISTS (
          SELECT 1 FROM public.purchase_order_items poi
          JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
          WHERE po.session_id = grp.session_id AND poi.material_id = spo.material_id
        )
    ),
    cobertura AS (
      SELECT sq.supplier_name, count(DISTINCT pend.material_id) AS n
      FROM pend
      JOIN public.supplier_quotes sq ON sq.session_id = grp.session_id
      JOIN public.supplier_quote_items sqi
        ON sqi.quote_id = sq.id AND sqi.matched_material_id = pend.material_id AND sqi.quantidade > 0
      GROUP BY sq.supplier_name
    )
    SELECT max(n), max(n) FILTER (WHERE supplier_name = v_anchor_supplier)
      INTO v_max_cobertura, v_anchor_cobertura
    FROM cobertura;

    IF v_max_cobertura IS NULL OR v_anchor_cobertura IS NULL OR v_anchor_cobertura < v_max_cobertura THEN
      -- Sem candidato nenhum, ou a âncora cobre MENOS que o líder — conflito
      -- de verdade, ou lacuna genuína. Não mexe (já reportado por 20260818150000).
      CONTINUE;
    END IF;

    -- Âncora empatada na cobertura máxima: ela vence. Reaproveita o
    -- cabeçalho dela (criado por 20260818122000/122500 a partir da seleção
    -- ideal) e estende os itens pendentes.
    SELECT po.id INTO v_header_id
    FROM public.purchase_orders po
    WHERE po.session_id = grp.session_id
      AND po.supplier_name = v_anchor_supplier
      AND (po.oc_number = grp.oc_number OR po.oc_number LIKE grp.oc_number || ' — %');

    IF v_header_id IS NULL THEN
      -- Não deveria acontecer (âncora sempre gera cabeçalho antes), mas se
      -- por algum motivo não existir, cria — sem nota de estimativa, porque
      -- é fornecedor confirmado por seleção real.
      SELECT qs.org_id, qs.budget_id INTO v_org_id, v_budget_id
      FROM public.quotation_sessions qs WHERE qs.id = grp.session_id;

      SELECT spo.user_id INTO v_user_id
      FROM public.scenario_purchase_orders spo WHERE spo.session_id = grp.session_id LIMIT 1;

      INSERT INTO public.purchase_orders
        (org_id, budget_id, session_id, oc_number, supplier_name, freight_value, delivery_date, status, user_id)
      VALUES (v_org_id, v_budget_id, grp.session_id, grp.oc_number, v_anchor_supplier, NULL, NULL, 'emitida', v_user_id)
      RETURNING id INTO v_header_id;
    END IF;

    WITH resolvido AS (
      SELECT v_header_id AS purchase_order_id, spo.material_id, sqi.quantidade,
             COALESCE(sqi.preco_negociado, sqi.preco_unit, 0) AS preco_unit
      FROM (
        SELECT DISTINCT material_id
        FROM public.scenario_purchase_orders spo
        WHERE spo.session_id = grp.session_id AND btrim(spo.oc_number) = grp.oc_number
          AND NOT EXISTS (
            SELECT 1 FROM public.purchase_order_items poi
            JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
            WHERE po.session_id = grp.session_id AND poi.material_id = spo.material_id
          )
      ) spo
      JOIN public.supplier_quotes sq ON sq.session_id = grp.session_id AND sq.supplier_name = v_anchor_supplier
      JOIN public.supplier_quote_items sqi
        ON sqi.quote_id = sq.id AND sqi.matched_material_id = spo.material_id AND sqi.quantidade > 0
    ),
    ins AS (
      INSERT INTO public.purchase_order_items (purchase_order_id, material_id, quantidade, preco_unit)
      SELECT purchase_order_id, material_id, quantidade, preco_unit FROM resolvido
      ON CONFLICT (purchase_order_id, material_id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_n FROM ins;

    IF v_n > 0 THEN
      v_grupos_corrigidos := v_grupos_corrigidos + 1;
      v_itens_inseridos := v_itens_inseridos + v_n;
    END IF;
  END LOOP;

  RAISE NOTICE 'Âncora venceu empate em % grupo(s), % itens inseridos.', v_grupos_corrigidos, v_itens_inseridos;
END
$do$;
